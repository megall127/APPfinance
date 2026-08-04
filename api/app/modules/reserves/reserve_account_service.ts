import { inject } from '@adonisjs/core'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import ReserveAccount from '#models/reserve_account'
import ReserveMovement from '#models/reserve_movement'
import ReserveRatePeriod from '#models/reserve_rate_period'
import LedgerService from '#modules/reserves/ledger_service'
import RateService from '#modules/reserves/rate_service'
import type { RateKind } from '#modules/reserves/rate_service'
import { annualEquivalent, monthsToGoal, fromCents, toCents } from '#modules/reserves/interest'

/**
 * Formato de data aceito pelas colunas `date` do MySQL. Toda data que entra numa cláusula
 * SQL passa por aqui — NUNCA `new Date(string)` (§4: em UTC-3 um `new Date('2026-07-01')`
 * vira 30/06 e joga o movimento no mês errado).
 */
const SQL_DATE = 'yyyy-MM-dd'

/** Casas do `taxaMensalEfetiva` no JSON — a mesma precisão de `yield_rate_applied` (§3.3). */
const MONTHLY_RATE_DIGITS = 10

/** Casas do `taxaAnualEquivalente` no JSON. */
const ANNUAL_RATE_DIGITS = 8

/** Casas do progresso de meta: fração 0..1 com resolução de 0,01%. */
const PROGRESS_DIGITS = 4

/**
 * DTO de POST /api/v1/reserves/accounts (§6.3), no formato que `createAccountValidator`
 * produz. É um tipo simples de propósito: importar o validator aqui criaria um ciclo.
 */
export type CreateAccountDto = {
  name: string
  institution?: string
  color?: string
  /** `YYYY-MM-DD` — âncora do primeiro mês de apuração; IMUTÁVEL depois de criada */
  openedAt: string
  rateKind: RateKind
  /** PERCENTUAL da vigência (0.85 | 12.5 | 102) */
  rateValue: number
  /** reais >= 0; vira o movimento `kind='opening'` datado em `openedAt` */
  saldoInicial?: number
  goalAmount?: number
  goalDate?: string
  goalMonthlyContribution?: number
  sortOrder?: number
}

/**
 * DTO de PATCH /api/v1/reserves/accounts/:id (§6.4) — tudo opcional, sem `openedAt`.
 *
 * Nos campos apagáveis, `undefined` e `null` querem dizer coisas diferentes:
 * ausente não mexe no valor gravado, `null` APAGA. Sem isso não haveria como
 * remover uma meta já cadastrada.
 */
export type UpdateAccountDto = {
  name?: string
  institution?: string | null
  color?: string
  rateKind?: RateKind
  rateValue?: number
  saldoInicial?: number
  goalAmount?: number | null
  goalDate?: string | null
  goalMonthlyContribution?: number | null
  sortOrder?: number
}

/** A vigência de taxa que governa o mês de referência, como sai no JSON (§6.2). */
export interface RateView {
  kind: RateKind
  /** decimal(9,6) do banco → STRING (`"102.000000"`) */
  value: string
  effectiveYear: number
  effectiveMonth: number
}

/**
 * A view de uma caixinha (§6.2), com a REGRA HÍBRIDA DE DINHEIRO de §1.3 aplicada campo
 * a campo:
 *
 *   campo que vem DIRETO de uma coluna `decimal` → **STRING** (`goalAmount`, `rate.value`);
 *   campo AGREGADO ou derivado em JS ........... → **NÚMERO** (`saldo`, `totalRendimento`,
 *                                                  taxas, progresso).
 */
export interface ReserveAccountView {
  /** `bigIncrements` → string no JSON, como o resto do app */
  id: string
  name: string
  institution: string | null
  color: string | null
  /** `YYYY-MM-DD` */
  openedAt: string
  /** decimal(12,2) do banco → STRING (`"30000.00"`) */
  goalAmount: string | null
  /** `YYYY-MM-DD` */
  goalDate: string | null
  /** decimal(12,2) do banco → STRING (`"1500.00"`) */
  goalMonthlyContribution: string | null
  sortOrder: number
  archived: boolean
  /** `'YYYY-MM'` do último mês já apurado; `null` enquanto nada foi fechado */
  lastClosedPeriod: string | null
  /** `null` só quando a conta não tem nenhuma vigência cadastrada */
  rate: RateView | null
  /** PERCENTUAL anual do CDI usado no mês; `null` fora de `kind='cdi'` */
  cdiAnnual: number | null
  /** de onde saiu o CDI: `'exact' | 'carry' | 'default'`; `null` fora de `kind='cdi'` */
  cdiSource: string | null
  /** FRAÇÃO 0..1 mensal; `null` quando não há taxa resolvível */
  taxaMensalEfetiva: number | null
  /** FRAÇÃO 0..1 anual equivalente */
  taxaAnualEquivalente: number | null
  /** rótulo pronto para a UI: `"102% do CDI · ≈1,19% a.m."` */
  rateLabel: string
  /** reais agregados em JS (centavos / 100) */
  saldo: number
  saldoInicial: number
  totalDepositado: number
  /** POSITIVO no rótulo (o razão guarda o saque negativo) */
  totalSacado: number
  /** ASSINADO — um ajuste pode ser para baixo */
  totalAjustes: number
  /** `Σ yield + Σ adjustment` (§6.7: ajuste conta como RENDIMENTO, não como aporte) */
  totalRendimento: number
  /** §5.6 — calculado em leitura, nunca materializado */
  rendimentoParcialDoMes: number
  rendimentoPrevistoDoMes: number
  /** FRAÇÃO 0..1 (como `percentualPago` do dashboard); `null` sem meta */
  metaProgresso: number | null
  metaFaltam: number | null
  /** meses até a meta pela MESMA recorrência do simulador; `null` se inalcançável */
  metaEtaMeses: number | null
}

/** Um mês da série de 12 meses do `/reserves/summary` (§6.1). */
export interface EvolutionPoint {
  year: number
  month: number
  saldoFinal: number
  rendimento: number
  aportes: number
  saques: number
}

/** Uma caixinha no resumo consolidado (§6.1). */
export interface SummaryAccount {
  accountId: string
  name: string
  color: string | null
  saldo: number
  rendimentoParcialDoMes: number
  metaProgresso: number | null
}

/**
 * Estado da apuração, derivado de `last_closed_period` — NUNCA de "existe linha de yield?"
 * (§1.2.7). Um mês de base zero não gera movimento algum; sem esta coluna o banner
 * "rendimentos desatualizados" nunca convergiria.
 */
export interface ApuracaoStatus {
  pendente: boolean
  /** primeiro mês ainda não apurado entre as contas pendentes */
  de?: { year: number; month: number }
  /** alvo da apuração: mês corrente − 1 (o mês em curso nunca é fechado) */
  ate?: { year: number; month: number }
  /** quantas caixinhas estão pendentes */
  contas?: number
}

/** Payload completo de GET /api/v1/reserves/summary (§6.1) — tudo agregado em JS. */
export interface ReserveSummaryView {
  year: number
  month: number
  totalGuardado: number
  totalPrincipal: number
  totalRendimento: number
  rendimentoParcialDoMes: number
  rendimentoPrevistoDoMes: number
  rendimentoDoMesAnterior: number
  rendimentoNoAno: number
  contasAtivas: number
  metaTotal: number
  metaProgresso: number | null
  porConta: SummaryAccount[]
  evolucao12m: EvolutionPoint[]
  apuracao: ApuracaoStatus
}

/** Soma assinada por kind, em CENTAVOS inteiros. */
type KindTotals = {
  opening: number
  deposit: number
  withdrawal: number
  adjustment: number
  yield: number
}

/** A view pública + os centavos que a produziram (o resumo agrega em centavos, não em reais). */
interface AccountComputation {
  view: ReserveAccountView
  saldoCents: number
  principalCents: number
  rendimentoCents: number
  parcialCents: number
  previstoCents: number
  metaCents: number | null
}

/**
 * Caixinhas de reserva: cadastro, taxa vigente, meta e a view consolidada de §6.2/§6.1.
 *
 * Regras duras deste service:
 * - `workspaceId: number` é SEMPRE o 1º parâmetro e toda query começa por
 *   `.where('workspace_id', workspaceId)`; o 404 nasce de `firstOrFail()` sobre a query já
 *   escopada, nunca de um `throw` manual (padrão de `items`/`categories`);
 * - REGRA HÍBRIDA DE DINHEIRO (§1.3): coluna `decimal` sai como STRING, agregado calculado
 *   em JS sai como NÚMERO — campo a campo, como documentado em `ReserveAccountView`;
 * - dinheiro é agregado em CENTAVOS INTEIROS (`toCents` linha a linha) e só vira reais na
 *   última linha (`#reais`), jamais somado em float;
 * - saldos vêm das queries AGREGADAS do `LedgerService` (`balancesByAccountCents`) e de uma
 *   única leitura por kind — nunca um SUM por conta dentro de um loop;
 * - datas só nascem de `DateTime.fromISO`/`fromObject` e viram string com `SQL_DATE`.
 */
@inject()
export default class ReserveAccountService {
  constructor(
    private rateService: RateService,
    private ledgerService: LedgerService
  ) {}

  /**
   * Lista as caixinhas do workspace já na view de §6.2: taxa resolvida do mês, saldos
   * derivados do razão, rendimento parcial/previsto (§5.6) e progresso da meta.
   *
   * @param workspaceId          escopo (1º parâmetro, sempre)
   * @param opts.includeArchived inclui as caixinhas arquivadas (default: só as ativas)
   * @param year                 ano de referência; default: ano corrente
   * @param month                mês de referência (1..12); default: mês corrente
   * @returns uma `ReserveAccountView` por caixinha, ordenadas por `sort_order`
   */
  async list(
    workspaceId: number,
    opts?: { includeArchived?: boolean },
    year?: number,
    month?: number
  ): Promise<ReserveAccountView[]> {
    const accounts = await this.#accountsQuery(workspaceId, opts?.includeArchived === true)
    const now = DateTime.now()
    const computed = await this.#compute(
      workspaceId,
      accounts,
      year ?? now.year,
      month ?? now.month
    )
    return computed.map((c) => c.view)
  }

  /**
   * Cria a caixinha + a PRIMEIRA vigência de taxa + (quando `saldoInicial > 0`) o movimento
   * `opening`, tudo na MESMA `db.transaction` (§6.3).
   *
   * A vigência nasce datada no mês de `openedAt` — e não no mês corrente — para que a
   * apuração retroativa encontre taxa desde o primeiro mês de vida da conta (§3.2).
   *
   * @param workspaceId escopo (1º parâmetro, sempre)
   * @param dto         payload já validado por `createAccountValidator`
   * @returns a view de §6.2 da conta recém-criada
   */
  async create(workspaceId: number, dto: CreateAccountDto): Promise<ReserveAccountView> {
    const openedAt = DateTime.fromISO(dto.openedAt)

    const account = await db.transaction(async (trx) => {
      const created = await ReserveAccount.create(
        {
          workspaceId,
          name: dto.name,
          institution: dto.institution ?? null,
          color: dto.color ?? null,
          openedAt,
          goalAmount: dto.goalAmount !== undefined ? dto.goalAmount.toFixed(2) : null,
          goalDate: dto.goalDate !== undefined ? DateTime.fromISO(dto.goalDate) : null,
          goalMonthlyContribution:
            dto.goalMonthlyContribution !== undefined
              ? dto.goalMonthlyContribution.toFixed(2)
              : null,
          sortOrder: dto.sortOrder ?? 0,
          archived: false,
          lastClosedPeriod: null,
        },
        { client: trx }
      )

      await ReserveRatePeriod.create(
        {
          workspaceId,
          reserveAccountId: Number(created.id),
          effectiveYear: openedAt.year,
          effectiveMonth: openedAt.month,
          rateKind: dto.rateKind,
          // PERCENTUAL em decimal(9,6): `102` grava `"102.000000"` (§5.0)
          rateValue: dto.rateValue.toFixed(6),
        },
        { client: trx }
      )

      // `opening` é o capital que JÁ existia no banco ao cadastrar — não é aporte, e por
      // isso fica fora de "quanto eu depositei". Zero não vira linha: uma conta sem
      // movimento nenhum ainda pode ser APAGADA de verdade no DELETE (§6.5).
      const saldoInicialCents = toCents(dto.saldoInicial ?? 0)
      if (saldoInicialCents > 0) {
        await ReserveMovement.create(
          {
            workspaceId,
            reserveAccountId: Number(created.id),
            kind: 'opening',
            occurredOn: openedAt,
            amount: fromCents(saldoInicialCents),
            description: null,
          },
          { client: trx }
        )
      }

      return created
    })

    return this.#viewFor(workspaceId, account)
  }

  /**
   * Atualiza a caixinha (§6.4). `openedAt` NÃO entra: mexer nela reescreveria a base de
   * todos os meses já apurados.
   *
   * - `rateKind`/`rateValue` fazem `updateOrCreate` da vigência do **MÊS CORRENTE** — o
   *   histórico de taxa é imutável, trocar de 100% para 110% do CDI em agosto não reescreve
   *   julho (§3.2);
   * - `saldoInicial` faz `updateOrCreate` do movimento `opening` datado em `openedAt`
   *   (e apaga o movimento quando o valor cai para zero).
   *
   * @param workspaceId escopo (1º parâmetro, sempre)
   * @param id          id da caixinha; `firstOrFail()` escopado → 404 cross-workspace
   * @param dto         payload já validado por `updateAccountValidator`
   * @returns a view de §6.2 + `recalcularSugerido` quando a mudança tocou um mês JÁ apurado
   */
  async update(
    workspaceId: number,
    id: number,
    dto: UpdateAccountDto
  ): Promise<ReserveAccountView & { recalcularSugerido: boolean }> {
    const account = await ReserveAccount.query()
      .where('workspace_id', workspaceId)
      .where('id', id)
      .firstOrFail()

    const now = DateTime.now()
    const accountId = Number(account.id)
    // Menor (ano * 12 + mês) tocado pela edição; `null` = nada que a apuração leia mudou.
    let affectedKey: number | null = null

    await db.transaction(async (trx) => {
      account.useTransaction(trx)

      if (dto.name !== undefined) account.name = dto.name
      if (dto.institution !== undefined) account.institution = dto.institution
      if (dto.color !== undefined) account.color = dto.color
      // `null` explícito APAGA o campo; ausente não mexe (ver UpdateAccountDto).
      if (dto.goalAmount !== undefined) {
        account.goalAmount = dto.goalAmount === null ? null : dto.goalAmount.toFixed(2)
      }
      if (dto.goalDate !== undefined) {
        account.goalDate = dto.goalDate === null ? null : DateTime.fromISO(dto.goalDate)
      }
      if (dto.goalMonthlyContribution !== undefined) {
        account.goalMonthlyContribution =
          dto.goalMonthlyContribution === null ? null : dto.goalMonthlyContribution.toFixed(2)
      }
      if (dto.sortOrder !== undefined) account.sortOrder = dto.sortOrder
      await account.save()

      if (dto.rateKind !== undefined || dto.rateValue !== undefined) {
        // Só um dos dois pode vir: o que faltar é herdado da vigência que governa HOJE,
        // senão a nova vigência do mês nasceria com meia taxa.
        const vigente = await this.rateService.resolveRatePeriod(
          workspaceId,
          accountId,
          now.year,
          now.month,
          trx
        )
        const kind = dto.rateKind ?? (vigente?.rateKind as RateKind | undefined) ?? 'monthly'
        const value = dto.rateValue ?? Number(vigente?.rateValue ?? 0)

        await ReserveRatePeriod.updateOrCreate(
          {
            reserveAccountId: accountId,
            effectiveYear: now.year,
            effectiveMonth: now.month,
          },
          { workspaceId, rateKind: kind, rateValue: value.toFixed(6) },
          { client: trx }
        )
        affectedKey = this.#minKey(affectedKey, now.year * 12 + now.month)
      }

      if (dto.saldoInicial !== undefined) {
        const cents = toCents(dto.saldoInicial)
        if (cents > 0) {
          await ReserveMovement.updateOrCreate(
            { reserveAccountId: accountId, kind: 'opening' },
            {
              workspaceId,
              occurredOn: account.openedAt,
              amount: fromCents(cents),
            },
            { client: trx }
          )
        } else {
          await ReserveMovement.query({ client: trx })
            .where('workspace_id', workspaceId)
            .where('reserve_account_id', accountId)
            .where('kind', 'opening')
            .delete()
        }
        affectedKey = this.#minKey(affectedKey, account.openedAt.year * 12 + account.openedAt.month)
      }
    })

    const view = await this.#viewFor(workspaceId, account)
    return { ...view, recalcularSugerido: this.#affectsClosed(account, affectedKey) }
  }

  /**
   * Apaga ou arquiva a caixinha (§6.5).
   *
   * Sem nenhum movimento → `delete()` de verdade (o `CASCADE` do banco leva as vigências de
   * taxa junto). Com movimentos → `archived = true`: o `CASCADE` continua ativo e apagar a
   * linha levaria o razão inteiro embora.
   *
   * Devolve SEMPRE as duas chaves (padrão de `items`/`categories`), para o chamador não
   * precisar inferir o que aconteceu.
   *
   * @param workspaceId escopo (1º parâmetro, sempre)
   * @param id          id da caixinha; `firstOrFail()` escopado → 404 cross-workspace
   */
  async destroy(workspaceId: number, id: number): Promise<{ archived: boolean; deleted: boolean }> {
    const account = await ReserveAccount.query()
      .where('workspace_id', workspaceId)
      .where('id', id)
      .firstOrFail()

    const movement = await ReserveMovement.query()
      .where('workspace_id', workspaceId)
      .where('reserve_account_id', id)
      .first()

    if (movement !== null) {
      account.archived = true
      await account.save()
      return { archived: true, deleted: false }
    }

    await account.delete()
    return { archived: false, deleted: true }
  }

  /**
   * Consolidado do workspace (§6.1) — o que alimenta o painel "Guardado" e o cabeçalho da
   * página de Reservas. Só contas ATIVAS entram: uma caixinha arquivada é uma caixinha que
   * o usuário mandou sumir.
   *
   * `apuracao` é derivada de `last_closed_period` (§1.2.7), não de "existe linha de yield?" —
   * é isso que faz o banner convergir mesmo num mês em que nada foi creditado.
   *
   * @param workspaceId escopo (1º parâmetro, sempre)
   * @param year        ano de referência
   * @param month       mês de referência (1..12)
   */
  async summary(workspaceId: number, year: number, month: number): Promise<ReserveSummaryView> {
    const accounts = await this.#accountsQuery(workspaceId, false)
    const computed = await this.#compute(workspaceId, accounts, year, month)

    let totalGuardadoCents = 0
    let totalPrincipalCents = 0
    let totalRendimentoCents = 0
    let parcialCents = 0
    let previstoCents = 0
    let metaTotalCents = 0

    const porConta: SummaryAccount[] = computed.map((c) => {
      totalGuardadoCents += c.saldoCents
      totalPrincipalCents += c.principalCents
      totalRendimentoCents += c.rendimentoCents
      parcialCents += c.parcialCents
      previstoCents += c.previstoCents
      metaTotalCents += c.metaCents ?? 0

      return {
        accountId: c.view.id,
        name: c.view.name,
        color: c.view.color,
        saldo: c.view.saldo,
        rendimentoParcialDoMes: c.view.rendimentoParcialDoMes,
        metaProgresso: c.view.metaProgresso,
      }
    })

    const janela = await this.#window(workspaceId, accounts, year, month)

    return {
      year,
      month,
      totalGuardado: this.#reais(totalGuardadoCents),
      totalPrincipal: this.#reais(totalPrincipalCents),
      totalRendimento: this.#reais(totalRendimentoCents),
      rendimentoParcialDoMes: this.#reais(parcialCents),
      rendimentoPrevistoDoMes: this.#reais(previstoCents),
      rendimentoDoMesAnterior: this.#reais(janela.mesAnteriorCents),
      rendimentoNoAno: this.#reais(janela.noAnoCents),
      contasAtivas: accounts.length,
      metaTotal: this.#reais(metaTotalCents),
      metaProgresso:
        metaTotalCents > 0
          ? this.#round(totalGuardadoCents / metaTotalCents, PROGRESS_DIGITS)
          : null,
      porConta,
      evolucao12m: janela.evolucao,
      apuracao: this.#apuracao(accounts),
    }
  }

  /**
   * Query base de contas: escopada por workspace, ordenada por `sort_order` (a ordem que o
   * usuário arrasta) e filtrando as arquivadas quando o chamador não pediu por elas.
   */
  #accountsQuery(workspaceId: number, includeArchived: boolean) {
    const query = ReserveAccount.query()
      .where('workspace_id', workspaceId)
      .orderBy('sort_order', 'asc')
      .orderBy('id', 'asc')

    if (!includeArchived) query.where('archived', false)

    return query
  }

  /**
   * Monta a view de §6.2 de UMA conta (o retorno de `create`/`update`), reaproveitando
   * exatamente o mesmo caminho de cálculo da listagem — a resposta do POST não pode
   * divergir do que o GET seguinte devolve.
   */
  async #viewFor(workspaceId: number, account: ReserveAccount): Promise<ReserveAccountView> {
    const now = DateTime.now()
    const [computed] = await this.#compute(workspaceId, [account], now.year, now.month)
    return computed.view
  }

  /**
   * O cálculo de todas as contas de uma vez, sem N+1 nos saldos: DUAS leituras agregadas
   * (`balancesByAccountCents` + totais por kind) servem a lista inteira; só a taxa e o
   * rendimento parcial — que dependem da vigência de CADA conta — rodam por conta.
   *
   * Tudo é fotografado no FIM do mês de referência: `saldo` de um mês passado é o saldo
   * daquele mês, não o de hoje.
   */
  async #compute(
    workspaceId: number,
    accounts: ReserveAccount[],
    year: number,
    month: number
  ): Promise<AccountComputation[]> {
    if (accounts.length === 0) return []

    const first = DateTime.fromObject({ year, month, day: 1 })
    const last = first.endOf('month')
    const daysInMonth = first.daysInMonth ?? 30

    const now = DateTime.now()
    const refKey = year * 12 + month
    const nowKey = now.year * 12 + now.month
    // Mês passado → o "parcial" é o mês inteiro; mês futuro → nada rendeu ainda (o dia 1 só
    // existe para o `previsto`, o parcial é zerado abaixo).
    const today = refKey < nowKey ? daysInMonth : refKey > nowKey ? 1 : now.day

    const balances = await this.ledgerService.balancesByAccountCents(workspaceId, last)
    const totals = await this.#kindTotalsByAccount(workspaceId, last)

    const out: AccountComputation[] = []

    for (const account of accounts) {
      const accountId = Number(account.id)
      const rate = await this.rateService.resolveMonthlyRate(workspaceId, accountId, year, month)
      const i = rate?.i ?? null

      const partial = await this.ledgerService.partialYieldFor(
        workspaceId,
        accountId,
        year,
        month,
        today,
        i
      )

      const kinds = totals.get(accountId) ?? this.#zeroTotals()
      const saldoCents = balances.get(accountId) ?? 0
      const principalCents = kinds.opening + kinds.deposit + kinds.withdrawal
      const rendimentoCents = kinds.yield + kinds.adjustment
      const parcialCents = refKey > nowKey ? 0 : partial.rendimentoParcialCents
      const previstoCents = partial.rendimentoPrevistoCents

      const metaCents = account.goalAmount !== null ? toCents(account.goalAmount) : null
      const aporteCents =
        account.goalMonthlyContribution !== null ? toCents(account.goalMonthlyContribution) : 0

      out.push({
        view: {
          id: String(account.id),
          name: account.name,
          institution: account.institution,
          color: account.color,
          openedAt: account.openedAt.toFormat(SQL_DATE),
          goalAmount: account.goalAmount,
          goalDate: account.goalDate !== null ? account.goalDate.toFormat(SQL_DATE) : null,
          goalMonthlyContribution: account.goalMonthlyContribution,
          sortOrder: Number(account.sortOrder),
          // o driver serializa `boolean` como 0/1 (§8.2)
          archived: Boolean(account.archived),
          lastClosedPeriod: account.lastClosedPeriod,
          rate:
            rate !== null
              ? {
                  kind: rate.kind,
                  value: rate.period.rateValue,
                  effectiveYear: Number(rate.period.effectiveYear),
                  effectiveMonth: Number(rate.period.effectiveMonth),
                }
              : null,
          cdiAnnual: rate?.cdi?.annualRate ?? null,
          cdiSource: rate?.cdi?.source ?? null,
          taxaMensalEfetiva: i !== null ? this.#round(i, MONTHLY_RATE_DIGITS) : null,
          taxaAnualEquivalente:
            i !== null ? this.#round(annualEquivalent(i), ANNUAL_RATE_DIGITS) : null,
          rateLabel: this.#rateLabel(rate?.kind ?? null, rate?.value ?? null, i),
          saldo: this.#reais(saldoCents),
          saldoInicial: this.#reais(kinds.opening),
          totalDepositado: this.#reais(kinds.deposit),
          // o razão guarda o saque NEGATIVO; o rótulo "total sacado" é positivo
          totalSacado: this.#reais(Math.abs(kinds.withdrawal)),
          totalAjustes: this.#reais(kinds.adjustment),
          totalRendimento: this.#reais(rendimentoCents),
          rendimentoParcialDoMes: this.#reais(parcialCents),
          rendimentoPrevistoDoMes: this.#reais(previstoCents),
          metaProgresso:
            metaCents !== null && metaCents > 0
              ? this.#round(saldoCents / metaCents, PROGRESS_DIGITS)
              : null,
          metaFaltam: metaCents !== null ? this.#reais(Math.max(0, metaCents - saldoCents)) : null,
          metaEtaMeses:
            metaCents !== null && metaCents > 0
              ? monthsToGoal({
                  saldoInicialCents: saldoCents,
                  aporteCents,
                  i: i ?? 0,
                  metaCents,
                })
              : null,
        },
        saldoCents,
        principalCents,
        rendimentoCents,
        parcialCents,
        previstoCents,
        metaCents,
      })
    }

    return out
  }

  /**
   * Soma assinada por (conta, kind) em CENTAVOS, numa leitura só — é o que dá
   * `saldoInicial`, `totalDepositado`, `totalSacado`, `totalAjustes` e `totalRendimento` de
   * TODA a lista sem um SUM por conta dentro do loop.
   *
   * A soma é feita em JS (`toCents` linha a linha), e não em `SUM()` no SQL, pelo mesmo
   * motivo do `LedgerService`: `decimal` chega como string e dinheiro não se soma em float.
   *
   * @param asOf data-limite INCLUSIVA (fim do mês de referência)
   */
  async #kindTotalsByAccount(
    workspaceId: number,
    asOf: DateTime
  ): Promise<Map<number, KindTotals>> {
    const rows = await db
      .from('reserve_movements')
      .where('workspace_id', workspaceId)
      .where('occurred_on', '<=', asOf.toFormat(SQL_DATE))
      .select('reserve_account_id', 'kind', 'amount')

    const byAccount = new Map<number, KindTotals>()
    for (const row of rows) {
      const accountId = Number(row.reserve_account_id)
      const totals = byAccount.get(accountId) ?? this.#zeroTotals()
      const kind = row.kind as keyof KindTotals
      if (kind in totals) totals[kind] += toCents(row.amount)
      byAccount.set(accountId, totals)
    }

    return byAccount
  }

  /**
   * A janela de 12 meses que termina no mês de referência: a série `evolucao12m`, o
   * rendimento do mês anterior e o rendimento do ano — tudo de UMA leitura do razão.
   *
   * A janela sempre cobre janeiro do ano de referência (12 meses para trás a partir de
   * qualquer mês do ano), então `rendimentoNoAno` sai da mesma leitura.
   */
  async #window(
    workspaceId: number,
    accounts: ReserveAccount[],
    year: number,
    month: number
  ): Promise<{ evolucao: EvolutionPoint[]; mesAnteriorCents: number; noAnoCents: number }> {
    const first = DateTime.fromObject({ year, month, day: 1 })
    const start = first.minus({ months: 11 })
    const evolucao: EvolutionPoint[] = []

    if (accounts.length === 0) {
      for (let k = 0; k < 12; k++) {
        const cursor = start.plus({ months: k })
        evolucao.push({
          year: cursor.year,
          month: cursor.month,
          saldoFinal: 0,
          rendimento: 0,
          aportes: 0,
          saques: 0,
        })
      }
      return { evolucao, mesAnteriorCents: 0, noAnoCents: 0 }
    }

    const accountIds = accounts.map((account) => Number(account.id))

    // Saldo trazido de ANTES da janela: sem ele o primeiro ponto do gráfico nasceria zerado
    // numa conta antiga. Vem da mesma query agregada do razão (sem N+1).
    const before = await this.ledgerService.balancesByAccountCents(
      workspaceId,
      start.minus({ days: 1 })
    )
    let running = 0
    for (const accountId of accountIds) running += before.get(accountId) ?? 0

    // Modelo (e não `db.from`) para que `occurred_on` chegue como `DateTime` — um `date` cru
    // do driver viraria `Date` e o mês dependeria do fuso (§4).
    const rows = await ReserveMovement.query()
      .where('workspace_id', workspaceId)
      .whereIn('reserve_account_id', accountIds)
      .where('occurred_on', '>=', start.toFormat(SQL_DATE))
      .where('occurred_on', '<=', first.endOf('month').toFormat(SQL_DATE))

    const buckets = new Map<number, KindTotals>()
    for (const row of rows) {
      const key = row.occurredOn.year * 12 + row.occurredOn.month
      const totals = buckets.get(key) ?? this.#zeroTotals()
      const kind = row.kind as keyof KindTotals
      if (kind in totals) totals[kind] += toCents(row.amount)
      buckets.set(key, totals)
    }

    let mesAnteriorCents = 0
    let noAnoCents = 0

    for (let k = 0; k < 12; k++) {
      const cursor = start.plus({ months: k })
      const key = cursor.year * 12 + cursor.month
      const totals = buckets.get(key) ?? this.#zeroTotals()

      const aportesCents = totals.opening + totals.deposit
      const saquesCents = Math.abs(totals.withdrawal)
      // ajuste conta como RENDIMENTO, nunca como aporte (§6.7)
      const rendimentoCents = totals.yield + totals.adjustment
      running += aportesCents - saquesCents + rendimentoCents

      if (key === first.year * 12 + first.month - 1) mesAnteriorCents = rendimentoCents
      if (cursor.year === year) noAnoCents += rendimentoCents

      evolucao.push({
        year: cursor.year,
        month: cursor.month,
        saldoFinal: this.#reais(running),
        rendimento: this.#reais(rendimentoCents),
        aportes: this.#reais(aportesCents),
        saques: this.#reais(saquesCents),
      })
    }

    return { evolucao, mesAnteriorCents, noAnoCents }
  }

  /**
   * Estado da apuração a partir de `last_closed_period` (§1.2.7).
   *
   * O alvo é SEMPRE o mês corrente − 1 (§5.7: o mês em curso nunca é fechado). Uma conta
   * está pendente quando o primeiro mês que ela ainda não fechou — `last_closed_period + 1`,
   * ou o mês de `opened_at` quando nada foi fechado — cabe dentro do alvo.
   */
  #apuracao(accounts: ReserveAccount[]): ApuracaoStatus {
    const alvo = DateTime.now().minus({ months: 1 })
    const alvoKey = alvo.year * 12 + alvo.month

    let deKey: number | null = null
    let contas = 0

    for (const account of accounts) {
      const closedKey = this.#periodKey(account.lastClosedPeriod)
      const firstOpen =
        closedKey !== null ? closedKey + 1 : account.openedAt.year * 12 + account.openedAt.month
      if (firstOpen > alvoKey) continue
      contas += 1
      deKey = this.#minKey(deKey, firstOpen)
    }

    if (deKey === null) return { pendente: false }

    return {
      pendente: true,
      de: this.#fromKey(deKey),
      ate: { year: alvo.year, month: alvo.month },
      contas,
    }
  }

  /**
   * Rótulo pronto da taxa (§6.2): `"102% do CDI · ≈1,19% a.m."`.
   *
   * Espelha `formatRateLabel` do web (§7.5) — a UI mostra o mesmo texto vindo da API e do
   * preview local, e os dois não podem discordar. `monthly` não ganha a segunda leitura
   * porque ela seria a repetição do próprio número.
   */
  #rateLabel(kind: RateKind | null, value: number | null, i: number | null): string {
    if (kind === null || value === null) return 'Taxa não cadastrada'

    const bruto = this.#percent(value, 0, 4)
    const mensal = i !== null ? ` · ≈${this.#percent(i * 100, 2, 2)}% a.m.` : ''

    switch (kind) {
      case 'monthly':
        return `${bruto}% a.m.`
      case 'yearly':
        return `${bruto}% a.a.${mensal}`
      case 'cdi':
        return `${bruto}% do CDI${mensal}`
    }
  }

  /** Número em pt-BR para os rótulos de taxa: `102` → `"102"`, `0.85` → `"0,85"`. */
  #percent(value: number, min: number, max: number): string {
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: min,
      maximumFractionDigits: max,
    }).format(value)
  }

  /** CENTAVOS inteiros → reais como NÚMERO (§1.3: agregado em JS nunca sai como string). */
  #reais(cents: number): number {
    return cents / 100
  }

  /**
   * Arredondamento de fração para o JSON. Não é dinheiro (isso é `roundCents`): serve para
   * a taxa e o progresso não saírem como `0.42880933333333336` no payload.
   */
  #round(value: number, digits: number): number {
    return Number(value.toFixed(digits))
  }

  /** Totais zerados por kind — o default de toda conta sem movimento no recorte. */
  #zeroTotals(): KindTotals {
    return { opening: 0, deposit: 0, withdrawal: 0, adjustment: 0, yield: 0 }
  }

  /** `'2026-06'` → `2026 * 12 + 6`. `null`/formato inesperado → `null`. */
  #periodKey(period: string | null): number | null {
    if (period === null) return null
    const parsed = DateTime.fromFormat(period, 'yyyy-MM')
    if (!parsed.isValid) return null
    return parsed.year * 12 + parsed.month
  }

  /** `2026 * 12 + 6` → `{ year: 2026, month: 6 }` (mês 12 continua no próprio ano). */
  #fromKey(key: number): { year: number; month: number } {
    const year = Math.floor((key - 1) / 12)
    return { year, month: key - year * 12 }
  }

  /** Menor de dois `(ano * 12 + mês)`, tolerando o `null` do "ainda não tocou em nada". */
  #minKey(current: number | null, candidate: number): number {
    return current === null ? candidate : Math.min(current, candidate)
  }

  /**
   * `recalcularSugerido` (§6.4): a edição tocou um mês que JÁ foi apurado, logo os yields
   * gravados ficaram desatualizados e vale reprocessar.
   */
  #affectsClosed(account: ReserveAccount, affectedKey: number | null): boolean {
    if (affectedKey === null) return false
    const closedKey = this.#periodKey(account.lastClosedPeriod)
    return closedKey !== null && affectedKey <= closedKey
  }
}
