import ReserveMovement from '#models/reserve_movement'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { DateTime } from 'luxon'
import { partialBaseCents, roundCents, toCents, weightedBaseCents } from './interest.js'
import type { MovementInput } from './interest.js'

/**
 * Formato de data aceito pelas colunas `date` do MySQL. Toda data que entra numa
 * cláusula SQL passa por aqui — NUNCA `new Date(string)` (§13: em UTC-3 um
 * `new Date('2026-07-01')` vira 30/06 e joga o movimento no mês errado).
 */
const SQL_DATE = 'yyyy-MM-dd'

/** Os 5 tipos de lançamento do razão (§3.3). O banco guarda `enum` → chega como string. */
export type MovementKind = 'opening' | 'deposit' | 'withdrawal' | 'adjustment' | 'yield'

/** Um movimento do mês de competência, pronto para alimentar `weightedBaseCents`. */
export interface MonthMovement extends MovementInput {
  kind: MovementKind
}

/** Uma linha do extrato, já com o saldo corrente acumulado (§6.6). */
export interface StatementLine {
  id: number
  kind: MovementKind
  occurredOn: DateTime
  /** decimal(12,2) do banco → STRING ASSINADA (`"-2000.00"` num saque) */
  amount: string
  /** CENTAVOS inteiros e assinados */
  amountCents: number
  /** CENTAVOS inteiros: saldo da conta DEPOIS desta linha */
  saldoAposCents: number
  description: string | null
  /** Memória de cálculo congelada na linha; tudo `null` fora de `kind='yield'` */
  yieldPeriod: string | null
  yieldBase: string | null
  yieldRateApplied: string | null
  yieldRateKind: string | null
  yieldRateSource: string | null
  yieldCdiAnnual: string | null
}

/** Extrato de um intervalo: saldo de abertura, linhas com saldo corrente e saldo final. */
export interface Statement {
  /** CENTAVOS: Σ amount de tudo ANTERIOR a `from` */
  saldoInicialCents: number
  /** CENTAVOS: saldo depois da última linha do intervalo */
  saldoFinalCents: number
  movements: StatementLine[]
}

/** Rendimento do mês corrente calculado em leitura, nunca gravado (§5.6). */
export interface PartialYield {
  /** CENTAVOS FRACIONÁRIOS: base ponderada até hoje */
  baseParcial: number
  /** CENTAVOS inteiros: o que JÁ rendeu */
  rendimentoParcialCents: number
  /** CENTAVOS FRACIONÁRIOS: base ponderada do mês cheio */
  basePrevista: number
  /** CENTAVOS inteiros: o que deve fechar no fim do mês */
  rendimentoPrevistoCents: number
}

/**
 * Soma ASSINADA por tipo de lançamento, em CENTAVOS inteiros.
 * `withdrawal` vem NEGATIVO (o razão guarda o valor assinado) — quem monta a view
 * de §6.2 aplica `Math.abs` no rótulo "total sacado".
 */
export interface KindTotalsCents {
  opening: number
  deposit: number
  withdrawal: number
  adjustment: number
  yield: number
}

/**
 * O razão das caixinhas: **saldo é sempre `SUM(amount)`**, nunca uma coluna (§1.2).
 *
 * Regras duras deste service:
 * - `workspaceId: number` é SEMPRE o 1º parâmetro e toda query começa por
 *   `.where('workspace_id', workspaceId)`;
 * - `trx` opcional é SEMPRE o último parâmetro e o service **nunca abre conexão
 *   própria** — os testes rodam no banco de dev e o isolamento é 100%
 *   `withGlobalTransaction` (§13);
 * - dinheiro é somado em **CENTAVOS INTEIROS** (`toCents` linha a linha), jamais em
 *   float: este é o único módulo do app onde o erro acumula mês após mês (§1.2.4);
 * - datas só nascem de `DateTime.fromISO`/`fromObject` e viram string com `SQL_DATE`.
 */
export default class LedgerService {
  /**
   * Saldo derivado da conta: Σ amount de todos os movimentos até `asOf` (inclusive).
   *
   * @param workspaceId workspace dono da conta
   * @param accountId   id da caixinha
   * @param asOf        data-limite INCLUSIVA; `null`/omitido = saldo de hoje (tudo)
   * @param trx         transação do chamador
   * @returns CENTAVOS inteiros e assinados (pode ser negativo — o razão registra fatos)
   */
  async balanceCents(
    workspaceId: number,
    accountId: number,
    asOf?: DateTime | null,
    trx?: TransactionClientContract
  ): Promise<number> {
    const query = this.#movements(trx)
      .where('workspace_id', workspaceId)
      .where('reserve_account_id', accountId)
      .select('amount')

    if (asOf) query.where('occurred_on', '<=', asOf.toFormat(SQL_DATE))

    const rows = await query
    let cents = 0
    for (const row of rows) cents += toCents(row.amount)
    return cents
  }

  /**
   * Saldo de TODAS as caixinhas do workspace numa única query — é o que permite ao
   * `/reserves/summary` montar o consolidado sem N+1.
   *
   * @param workspaceId workspace
   * @param asOf        data-limite INCLUSIVA; `null`/omitido = tudo
   * @param trx         transação do chamador
   * @returns Map de `accountId` → CENTAVOS inteiros (só contas COM movimento aparecem)
   */
  async balancesByAccountCents(
    workspaceId: number,
    asOf?: DateTime | null,
    trx?: TransactionClientContract
  ): Promise<Map<number, number>> {
    const query = this.#movements(trx)
      .where('workspace_id', workspaceId)
      .select('reserve_account_id', 'amount')

    if (asOf) query.where('occurred_on', '<=', asOf.toFormat(SQL_DATE))

    const rows = await query
    const byAccount = new Map<number, number>()
    for (const row of rows) {
      const accountId = Number(row.reserve_account_id)
      byAccount.set(accountId, (byAccount.get(accountId) ?? 0) + toCents(row.amount))
    }
    return byAccount
  }

  /**
   * Movimentos DENTRO do mês de competência, em ordem `(occurred_on, id)`.
   *
   * `opts.excludeYield` existe para a apuração (§5.3): a base do mês M não pode
   * conter o `yield` do PRÓPRIO mês M, senão reprocessar deixaria de ser idempotente
   * (o rendimento renderia sobre si mesmo a cada execução).
   *
   * @param workspaceId      workspace
   * @param accountId        id da caixinha
   * @param year             ano de competência
   * @param month            mês de competência (1..12)
   * @param opts.excludeYield descarta as linhas `kind='yield'` do próprio mês
   * @param trx              transação do chamador
   * @returns dia do mês + CENTAVOS assinados + kind, prontos para `weightedBaseCents`
   */
  async monthMovements(
    workspaceId: number,
    accountId: number,
    year: number,
    month: number,
    opts?: { excludeYield?: boolean },
    trx?: TransactionClientContract
  ): Promise<MonthMovement[]> {
    const first = DateTime.fromObject({ year, month, day: 1 })

    const query = ReserveMovement.query(trx ? { client: trx } : undefined)
      .where('workspace_id', workspaceId)
      .where('reserve_account_id', accountId)
      .where('occurred_on', '>=', first.toFormat(SQL_DATE))
      .where('occurred_on', '<=', first.endOf('month').toFormat(SQL_DATE))
      .orderBy('occurred_on', 'asc')
      .orderBy('id', 'asc')

    if (opts?.excludeYield) query.whereNot('kind', 'yield')

    const rows = await query
    return rows.map((movement) => ({
      day: movement.occurredOn.day,
      amountCents: toCents(movement.amount),
      kind: movement.kind as MovementKind,
    }))
  }

  /**
   * Base ponderada do mês CHEIO (§5.3): `B = S₀ + Σ m_k × peso(d_k)`, com clamp em 0.
   * `S₀` sai do próprio razão — já com os yields dos meses anteriores gravados, que é
   * exatamente o que torna a capitalização composta EMERGENTE (§5.5).
   *
   * @param workspaceId workspace
   * @param accountId   id da caixinha
   * @param year        ano de competência
   * @param month       mês de competência (1..12)
   * @param trx         transação do chamador
   * @returns CENTAVOS FRACIONÁRIOS (≥ 0) — nunca arredondados antes do produto `B × i`
   */
  async weightedBaseFor(
    workspaceId: number,
    accountId: number,
    year: number,
    month: number,
    trx?: TransactionClientContract
  ): Promise<number> {
    const first = DateTime.fromObject({ year, month, day: 1 })
    const openingCents = await this.balanceCents(
      workspaceId,
      accountId,
      first.minus({ days: 1 }),
      trx
    )
    const movements = await this.monthMovements(
      workspaceId,
      accountId,
      year,
      month,
      { excludeYield: true },
      trx
    )

    return weightedBaseCents({
      openingCents,
      movements,
      daysInMonth: this.#daysInMonth(first),
    })
  }

  /**
   * Rendimento PARCIAL e PREVISTO do mês corrente (§5.6) — calculado em leitura,
   * nunca materializado. É o que impede o painel "Guardado" de nascer mostrando
   * R$ 0,00 durante os ~30 dias do mês.
   *
   * Em `today === daysInMonth` a base parcial coincide BIT A BIT com a prevista.
   *
   * @param workspaceId workspace
   * @param accountId   id da caixinha
   * @param year        ano do mês corrente
   * @param month       mês corrente (1..12)
   * @param today       dia de hoje (1..daysInMonth); é truncado e clampado
   * @param i           taxa efetiva mensal em FRAÇÃO 0..1; `null` quando não há taxa
   *                    resolvível (kind='cdi' sem CDI) → rendimentos saem 0
   * @param trx         transação do chamador
   * @returns bases em CENTAVOS FRACIONÁRIOS e rendimentos em CENTAVOS inteiros
   */
  async partialYieldFor(
    workspaceId: number,
    accountId: number,
    year: number,
    month: number,
    today: number,
    i: number | null,
    trx?: TransactionClientContract
  ): Promise<PartialYield> {
    const first = DateTime.fromObject({ year, month, day: 1 })
    const daysInMonth = this.#daysInMonth(first)

    const openingCents = await this.balanceCents(
      workspaceId,
      accountId,
      first.minus({ days: 1 }),
      trx
    )
    const movements = await this.monthMovements(
      workspaceId,
      accountId,
      year,
      month,
      { excludeYield: true },
      trx
    )

    const baseParcial = partialBaseCents({ openingCents, movements, daysInMonth, today })
    const basePrevista = weightedBaseCents({ openingCents, movements, daysInMonth })

    return {
      baseParcial,
      rendimentoParcialCents: i === null ? 0 : roundCents(baseParcial * i),
      basePrevista,
      rendimentoPrevistoCents: i === null ? 0 : roundCents(basePrevista * i),
    }
  }

  /**
   * Extrato do intervalo `[from, to]` com saldo corrente linha a linha (§6.6).
   *
   * A ordem é `(occurred_on ASC, id ASC)` — a MESMA que define o saldo corrente; a UI
   * inverte para mostrar do mais recente ao mais antigo, mas o acúmulo tem que ser
   * feito aqui, cronologicamente, ou dois lançamentos no mesmo dia acumulariam em
   * ordem imprevisível.
   *
   * @param workspaceId workspace
   * @param accountId   id da caixinha
   * @param from        início do intervalo (INCLUSIVO)
   * @param to          fim do intervalo (INCLUSIVO)
   * @param trx         transação do chamador
   * @returns saldo anterior a `from`, linhas com `saldoAposCents` e saldo final
   */
  async statement(
    workspaceId: number,
    accountId: number,
    from: DateTime,
    to: DateTime,
    trx?: TransactionClientContract
  ): Promise<Statement> {
    const saldoInicialCents = await this.balanceCents(
      workspaceId,
      accountId,
      from.minus({ days: 1 }),
      trx
    )

    const rows = await ReserveMovement.query(trx ? { client: trx } : undefined)
      .where('workspace_id', workspaceId)
      .where('reserve_account_id', accountId)
      .where('occurred_on', '>=', from.toFormat(SQL_DATE))
      .where('occurred_on', '<=', to.toFormat(SQL_DATE))
      .orderBy('occurred_on', 'asc')
      .orderBy('id', 'asc')

    let saldoCents = saldoInicialCents
    const movements: StatementLine[] = rows.map((movement) => {
      const amountCents = toCents(movement.amount)
      saldoCents += amountCents
      return {
        id: Number(movement.id),
        kind: movement.kind as MovementKind,
        occurredOn: movement.occurredOn,
        amount: movement.amount,
        amountCents,
        saldoAposCents: saldoCents,
        description: movement.description,
        yieldPeriod: movement.yieldPeriod,
        yieldBase: movement.yieldBase,
        yieldRateApplied: movement.yieldRateApplied,
        yieldRateKind: movement.yieldRateKind,
        yieldRateSource: movement.yieldRateSource,
        yieldCdiAnnual: movement.yieldCdiAnnual,
      }
    })

    return { saldoInicialCents, saldoFinalCents: saldoCents, movements }
  }

  /**
   * Soma assinada por tipo de lançamento, numa query só — a matéria-prima de
   * `totalPrincipal` e `totalRendimento` (§6.2).
   *
   * Quem monta a view compõe assim (§6.7):
   *   `totalPrincipal  = opening + deposit + withdrawal`   (withdrawal já é negativo)
   *   `totalRendimento = yield + adjustment`               ← ajuste conta como RENDIMENTO
   * A diferença contra o extrato do banco é, esmagadoramente, rendimento real não
   * modelado; contá-la como aporte inflaria "quanto eu coloquei" e encolheria
   * "quanto rendeu" a cada reconciliação.
   *
   * @param workspaceId workspace
   * @param accountId   id da caixinha
   * @param trx         transação do chamador
   * @returns CENTAVOS inteiros e ASSINADOS por kind; kinds sem linha vêm 0
   */
  async totalsByKindCents(
    workspaceId: number,
    accountId: number,
    trx?: TransactionClientContract
  ): Promise<KindTotalsCents> {
    const rows = await this.#movements(trx)
      .where('workspace_id', workspaceId)
      .where('reserve_account_id', accountId)
      .select('kind', 'amount')

    const totals: KindTotalsCents = {
      opening: 0,
      deposit: 0,
      withdrawal: 0,
      adjustment: 0,
      yield: 0,
    }

    for (const row of rows) {
      const kind = row.kind as MovementKind
      if (kind in totals) totals[kind] += toCents(row.amount)
    }

    return totals
  }

  /**
   * Query builder cru sobre `reserve_movements`, ligado à transação do chamador
   * quando ela existe. Nunca abre transação própria.
   */
  #movements(trx?: TransactionClientContract) {
    return trx ? trx.from('reserve_movements') : db.from('reserve_movements')
  }

  /**
   * Dias reais do mês (28 | 29 | 30 | 31) a partir do luxon — nunca uma constante.
   * O `?? 30` só é alcançável com um `DateTime` inválido (mês fora de 1..12), que
   * os validators de §6 já barram antes de chegar aqui.
   */
  #daysInMonth(dt: DateTime): number {
    return dt.daysInMonth ?? 30
  }
}
