import { inject } from '@adonisjs/core'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { DateTime } from 'luxon'
import ReserveAccount from '#models/reserve_account'
import ReserveMovement from '#models/reserve_movement'
import { fromCents, roundCents, toCents } from '#modules/reserves/interest'
import LedgerService from '#modules/reserves/ledger_service'
import RateService from '#modules/reserves/rate_service'
import type { CdiSource } from '#modules/reserves/rate_service'

/** Teto de meses processados por conta numa única chamada (§5.7) — protege a transação num backfill. */
const MAX_MONTHS = 120

/** Formato de `yield_period` e de `last_closed_period`: 'YYYY-MM'. */
const PERIOD_FORMAT = 'yyyy-MM'

/** Por que um mês não virou linha de rendimento (§5.4). A UI renderiza cada um destes. */
export type YieldSkipReason = 'base_zero' | 'zero_yield' | 'cdi_missing' | 'before_opening'

/** Opções da apuração: mês-alvo e conta. Tudo opcional — o default apura TUDO até o mês anterior. */
export interface CloseThroughOptions {
  /** ano-alvo; default = ano do mês anterior ao corrente */
  year?: number
  /** mês-alvo (1..12); default = mês anterior ao corrente */
  month?: number
  /** limita a apuração a uma caixinha; default = todas as não arquivadas */
  accountId?: number
}

/** Um mês que virou (ou reconfirmou) uma linha `kind='yield'` (§6.11). */
export interface YieldCloseDetail {
  /** `bigIncrements` → string no JSON, como todo id do módulo */
  accountId: string
  accountName: string
  /** 'YYYY-MM' do mês de competência */
  period: string
  /** decimal(12,2) que ESTAVA gravado; `null` quando a linha não existia */
  amountBefore: string | null
  /** decimal(12,2) gravado agora — `"145.89"` */
  amountAfter: string
  /** base ponderada com 6 casas, como vai para `yield_base` — `"12285.056667"` */
  base: string
  /** taxa efetiva mensal em FRAÇÃO com 10 casas — `"0.0118757178"` */
  rateApplied: string
  /** origem do CDI usado; `null` quando a conta não é indexada ao CDI */
  cdiSource: CdiSource | null
}

/** Um mês que NÃO gerou linha, com o motivo em linguagem de máquina (§5.4). */
export interface YieldCloseSkip {
  accountId: string
  accountName: string
  period: string
  reason: YieldSkipReason
}

/** Resposta de `POST /reserves/yield/close` (§6.11). */
export interface YieldCloseResult {
  /** 'YYYY-MM' até onde a apuração foi (já clampado ao mês anterior ao corrente) */
  throughPeriod: string
  /** `created + updated + unchanged` — quantos meses viraram linha de rendimento */
  processed: number
  created: number
  updated: number
  unchanged: number
  /** AGREGADO em JS → NÚMERO (§1.3): soma dos rendimentos materializados nesta execução */
  totalCreditado: number
  details: YieldCloseDetail[]
  skipped: YieldCloseSkip[]
}

/** Resultado interno de um mês de uma conta — vira `detail` ou `skip` no acumulado. */
type MonthOutcome =
  | { status: 'created' | 'updated' | 'unchanged'; detail: YieldCloseDetail; amountCents: number }
  | { status: 'skipped'; skip: YieldCloseSkip }

/**
 * Apuração do rendimento mensal (§5.7): materializa `kind='yield'` no último dia de cada
 * mês de competência, da abertura da conta até o mês-alvo, em ordem CRESCENTE.
 *
 * As quatro regras que fazem esta classe ser o que é:
 *
 * 1. **Uma transação só.** Todos os services filhos recebem o MESMO `trx` e nenhum abre
 *    conexão própria (§5.7) — os testes rodam no banco de dev e o isolamento é 100%
 *    `withGlobalTransaction`. Quando o chamador já tem uma transação, ela é reaproveitada
 *    (mesmo padrão de `WorkspaceService.provisionForUser`).
 * 2. **Ordem crescente.** O rendimento de M é datado no último dia de M, logo entra em
 *    `S₀(M+1)` com peso 1: a capitalização composta é EMERGENTE, ninguém a programa (§5.5).
 * 3. **Reprocessar é uma função PURA de (movimentos, vigências, CDI).** A recomputação
 *    NUNCA lê os campos `yield_*` congelados na linha — eles existem para o humano
 *    auditar. Rodar `close` N vezes com as mesmas entradas produz bytes idênticos.
 * 4. **Nunca apura o mês corrente nem o futuro.** O alvo é clampado a `mês corrente − 1`;
 *    o rendimento do mês em curso é calculado em leitura por `LedgerService` (§5.6).
 *
 * Este é o ÚNICO escritor de `reserve_movements.kind='yield'` e de
 * `reserve_accounts.last_closed_period`.
 */
@inject()
export default class YieldService {
  constructor(
    private rateService: RateService,
    private ledgerService: LedgerService
  ) {}

  /**
   * Apura da abertura de cada conta até o mês-alvo, sempre por completo (não existe
   * dirty-tracking §1.2.7), e devolve o relatório de §6.11.
   *
   * @param workspaceId escopo (1º parâmetro, sempre)
   * @param opts        mês-alvo e conta; ver `CloseThroughOptions`
   * @param trx         transação do chamador; sem ela, abrimos UMA `db.transaction` que
   *                    cobre todas as contas e todos os meses
   */
  async closeThrough(
    workspaceId: number,
    opts: CloseThroughOptions = {},
    trx?: TransactionClientContract
  ): Promise<YieldCloseResult> {
    if (trx) return this.#close(workspaceId, opts, trx)
    return db.transaction((ownTrx) => this.#close(workspaceId, opts, ownTrx))
  }

  /** Corpo da apuração, já com a transação resolvida. */
  async #close(
    workspaceId: number,
    opts: CloseThroughOptions,
    trx: TransactionClientContract
  ): Promise<YieldCloseResult> {
    const target = this.#resolveTarget(opts)
    const targetKey = this.#monthKey(target)

    const result: YieldCloseResult = {
      throughPeriod: target.toFormat(PERIOD_FORMAT),
      processed: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      totalCreditado: 0,
      details: [],
      skipped: [],
    }

    const accounts = await this.#accounts(workspaceId, opts.accountId, trx)
    let creditadoCents = 0

    for (const account of accounts) {
      const opening = account.openedAt.startOf('month')
      const openingKey = this.#monthKey(opening)

      // Nenhum yield existe antes da abertura da conta — `opened_at` é a âncora (§3.1).
      if (targetKey < openingKey) {
        result.skipped.push(this.#skip(account, target.toFormat(PERIOD_FORMAT), 'before_opening'))
        continue
      }

      // Reapuração é sempre TOTAL (§5.7): recomeça da abertura, para que uma edição
      // retroativa se propague. Mas quando o histórico é mais longo que o teto de uma
      // chamada, repetir os mesmos MAX_MONTHS primeiros meses a cada chamada NUNCA
      // alcançaria o alvo — a conta ficaria eternamente sem apuração e com saldo
      // subestimado. Nesse caso (e só nele) retomamos de onde `last_closed_period`
      // parou, o que faz chamadas sucessivas convergirem. É numericamente seguro:
      // o S₀ do mês inicial vem do razão, que já contém os yields anteriores.
      const closedKey = this.#periodKey(account.lastClosedPeriod)
      const startKey =
        targetKey - openingKey + 1 <= MAX_MONTHS
          ? openingKey
          : Math.max(openingKey, (closedKey ?? openingKey - 1) + 1)
      const start = opening.plus({ months: startKey - openingKey })
      const months = Math.min(targetKey - startKey + 1, MAX_MONTHS)

      for (let offset = 0; offset < months; offset++) {
        const outcome = await this.#closeMonth(
          workspaceId,
          account,
          start.plus({ months: offset }),
          trx
        )

        if (outcome.status === 'skipped') {
          result.skipped.push(outcome.skip)
          continue
        }

        result[outcome.status] += 1
        result.processed += 1
        result.details.push(outcome.detail)
        creditadoCents += outcome.amountCents
      }

      // `last_closed_period` é o último mês REALMENTE processado: com o teto de 120 meses
      // a conta ainda não chegou ao alvo, e mentir aqui faria o banner de §6.1 convergir
      // antes da hora. Único escritor desta coluna (§3.1).
      account.lastClosedPeriod = start.plus({ months: months - 1 }).toFormat(PERIOD_FORMAT)
      account.useTransaction(trx)
      await account.save()
    }

    result.totalCreditado = Number(fromCents(creditadoCents))
    return result
  }

  /**
   * Um mês de competência de uma conta, na ordem de §5.7: vigência → CDI → base → gravação.
   *
   * @param month primeiro dia do mês de competência
   */
  async #closeMonth(
    workspaceId: number,
    account: ReserveAccount,
    month: DateTime,
    trx: TransactionClientContract
  ): Promise<MonthOutcome> {
    const accountId = Number(account.id)
    const year = month.year
    const monthNumber = month.month
    const period = month.toFormat(PERIOD_FORMAT)

    // 1 e 2 — vigência de taxa do mês + CDI anual do mês (carry-forward → default).
    const rate = await this.rateService.resolveMonthlyRate(
      workspaceId,
      accountId,
      year,
      monthNumber,
      trx
    )

    // 3 — S₀ e B saem do razão JÁ com os yields dos meses anteriores gravados (§5.5),
    //     e sem o yield do PRÓPRIO mês (senão o rendimento renderia sobre si mesmo).
    const base = await this.ledgerService.weightedBaseFor(
      workspaceId,
      accountId,
      year,
      monthNumber,
      trx
    )

    if (base <= 0) return this.#skipMonth(workspaceId, account, period, 'base_zero', trx)

    // Conta sem NENHUMA vigência cadastrada rende zero — §5.4 não prevê um motivo próprio
    // para isso e a taxa ausente já aparece na view da conta (§6.2).
    if (!rate) return this.#skipMonth(workspaceId, account, period, 'zero_yield', trx)

    // `i` só vem null em `kind='cdi'` sem CDI resolvível: nunca assumimos zero silenciosamente.
    if (rate.i === null) return this.#skipMonth(workspaceId, account, period, 'cdi_missing', trx)

    // 4 — R = B × i, com B e i JAMAIS arredondados antes do produto (§5.4).
    const i = rate.i
    const amountCents = roundCents(base * i)
    if (amountCents < 1) return this.#skipMonth(workspaceId, account, period, 'zero_yield', trx)

    const existing = await this.#yieldRow(workspaceId, accountId, period, trx)
    const amountBefore = existing?.amount ?? null
    const amountAfter = fromCents(amountCents)
    const yieldBase = (base / 100).toFixed(6)
    const rateApplied = i.toFixed(10)

    await ReserveMovement.updateOrCreate(
      { reserveAccountId: accountId, yieldPeriod: period },
      {
        workspaceId,
        reserveAccountId: accountId,
        kind: 'yield',
        // `.startOf('day')` depois do `endOf('month')`: a coluna é `date`, então o horário
        // não vai para o banco — mas mantê-lo em 00:00 faz a linha relida bater com a
        // recalculada e o `save()` não sujar `updated_at` numa reexecução idêntica.
        occurredOn: month.endOf('month').startOf('day'),
        amount: amountAfter,
        yieldPeriod: period,
        // Memória de cálculo congelada (§5.4): escrita para o humano ler, NUNCA lida de volta.
        yieldBase,
        yieldRateApplied: rateApplied,
        yieldRateKind: rate.kind,
        yieldRateSource: rate.value.toFixed(6),
        yieldCdiAnnual: rate.cdi ? rate.cdi.annualRate.toFixed(6) : null,
      },
      { client: trx }
    )

    const status = !existing
      ? 'created'
      : toCents(existing.amount) === amountCents
        ? 'unchanged'
        : 'updated'

    return {
      status,
      amountCents,
      detail: {
        accountId: String(account.id),
        accountName: account.name,
        period,
        amountBefore,
        amountAfter,
        base: yieldBase,
        rateApplied,
        cdiSource: rate.cdi?.source ?? null,
      },
    }
  }

  /**
   * Monta o skip do mês e apaga um rendimento que uma execução anterior tenha gravado ali.
   *
   * Sem esse apagamento a apuração deixaria de ser uma função pura das entradas: apagar um
   * depósito antigo até zerar a base do mês manteria o yield velho no razão e ele voltaria
   * a compor `S₀` de todos os meses seguintes.
   */
  async #skipMonth(
    workspaceId: number,
    account: ReserveAccount,
    period: string,
    reason: YieldSkipReason,
    trx: TransactionClientContract
  ): Promise<MonthOutcome> {
    await ReserveMovement.query({ client: trx })
      .where('workspace_id', workspaceId)
      .where('reserve_account_id', Number(account.id))
      .where('yield_period', period)
      .delete()

    return { status: 'skipped', skip: this.#skip(account, period, reason) }
  }

  /** Linha de `skipped` do payload de §6.11. */
  #skip(account: ReserveAccount, period: string, reason: YieldSkipReason): YieldCloseSkip {
    return {
      accountId: String(account.id),
      accountName: account.name,
      period,
      reason,
    }
  }

  /** O rendimento já gravado para `(conta, período)`, se existir — a base de `amountBefore`. */
  #yieldRow(
    workspaceId: number,
    accountId: number,
    period: string,
    trx: TransactionClientContract
  ) {
    return ReserveMovement.query({ client: trx })
      .where('workspace_id', workspaceId)
      .where('reserve_account_id', accountId)
      .where('yield_period', period)
      .first()
  }

  /**
   * Mês-alvo da apuração, CLAMPADO a `mês corrente − 1` (§5.7): a apuração nunca fecha o
   * mês em curso nem um mês futuro. Sem `year`/`month` o alvo já é o mês anterior; com
   * `year` sozinho, dezembro daquele ano (que o clamp corta quando for o ano corrente).
   */
  #resolveTarget(opts: CloseThroughOptions): DateTime {
    const limit = DateTime.now().startOf('month').minus({ months: 1 })
    const year = opts.year ?? limit.year
    const month = opts.month ?? (opts.year === undefined ? limit.month : 12)
    const requested = DateTime.fromObject({ year, month, day: 1 })

    return this.#monthKey(requested) > this.#monthKey(limit) ? limit : requested
  }

  /**
   * Contas elegíveis: as não arquivadas do workspace, na ordem da página (§6.2).
   * Arquivada não apura — o razão dela está congelado.
   */
  #accounts(workspaceId: number, accountId: number | undefined, trx: TransactionClientContract) {
    const query = ReserveAccount.query({ client: trx })
      .where('workspace_id', workspaceId)
      .where('archived', false)
      .orderBy('sort_order', 'asc')
      .orderBy('id', 'asc')

    if (accountId !== undefined) query.where('id', accountId)

    return query
  }

  /**
   * (ano, mês) como um inteiro comparável — `ano * 12 + mês`, jamais ordenação de string
   * (`'2026-9'` > `'2026-10'` lexicograficamente).
   */
  #monthKey(dt: DateTime): number {
    return dt.year * 12 + dt.month
  }

  /** `'2026-06'` → 24318 (mesma escala de `#monthKey`); null quando nunca apurou. */
  #periodKey(period: string | null): number | null {
    if (!period) return null
    const [year, month] = period.split('-').map(Number)
    if (!Number.isFinite(year) || !Number.isFinite(month)) return null
    return year * 12 + month
  }
}
