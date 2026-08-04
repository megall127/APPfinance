import ReserveRatePeriod from '#models/reserve_rate_period'
import CdiRate from '#models/cdi_rate'
import { effectiveMonthlyRate } from '#modules/reserves/interest'
import { DEFAULT_CDI_ANNUAL } from '#modules/reserves/cdi_defaults'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

/** Espécie da taxa da vigência (§3.2). O banco devolve `enum` como `string` — o cast vive aqui. */
export type RateKind = 'monthly' | 'yearly' | 'cdi'

/** De onde saiu o CDI anual devolvido: linha do mês, carry-forward de um mês anterior, ou constante. */
export type CdiSource = 'exact' | 'carry' | 'default'

/** CDI anual resolvido para um mês de competência. `annualRate` é PERCENTUAL (14.9 = 14,90% a.a.). */
export interface ResolvedCdi {
  /** PERCENTUAL anual — `14.9`, nunca `0.149` */
  annualRate: number
  source: CdiSource
  /** ano da vigência usada; `null` quando `source = 'default'` */
  year: number | null
  /** mês (1..12) da vigência usada; `null` quando `source = 'default'` */
  month: number | null
}

/** Vigência de taxa de um mês já combinada com o CDI e convertida em taxa efetiva mensal. */
export interface ResolvedMonthlyRate {
  /** a linha de `reserve_rate_periods` que governa o mês */
  period: ReserveRatePeriod
  kind: RateKind
  /** PERCENTUAL bruto da vigência — `0.85` | `12.5` | `102` */
  value: number
  /** CDI usado; `null` quando `kind !== 'cdi'` */
  cdi: ResolvedCdi | null
  /** FRAÇÃO 0..1 mensal, ou `null` quando `kind='cdi'` e não há CDI resolvível (→ skip 'cdi_missing') */
  i: number | null
}

/**
 * Resolução das taxas de um mês de competência: qual vigência governa a conta (§3.2) e
 * qual CDI anual vale para o mês (§3.4).
 *
 * Regras que valem para TODO método deste service:
 *  - toda query começa por `.where('workspace_id', workspaceId)` — `workspaceId` é sempre
 *    o 1º parâmetro e é a única barreira de escopo do módulo;
 *  - o `trx` é OPCIONAL e entra via `.useTransaction(trx)`. Este service NUNCA abre
 *    transação própria (§5.7): quem controla atomicidade é o chamador (a apuração roda
 *    tudo numa `db.transaction`, e os testes rodam em `withGlobalTransaction`);
 *  - a comparação de (ano, mês) é feita por ARITMÉTICA `ano * 12 + mês`, jamais por
 *    ordenação de strings — `'2026-9'` > `'2026-10'` lexicograficamente.
 */
export default class RateService {
  /**
   * Vigência de taxa que governa a conta no mês de competência (year, month).
   *
   * Devolve a vigência MAIS RECENTE com `(effective_year, effective_month) <= (year, month)`.
   * Se nenhuma casar — o caso do mês anterior à primeira vigência cadastrada, que acontece
   * sempre que o usuário cadastra a taxa depois de abrir a conta —, devolve a MAIS ANTIGA
   * da conta, para que a apuração retroativa não fique sem taxa. `null` só quando a conta
   * não tem nenhuma vigência.
   *
   * @param workspaceId escopo (1º parâmetro, sempre)
   * @param accountId   id da `reserve_account`
   * @param year        ano de competência
   * @param month       mês de competência (1..12)
   * @param trx         transação do chamador; nunca abrimos uma própria
   */
  async resolveRatePeriod(
    workspaceId: number,
    accountId: number,
    year: number,
    month: number,
    trx?: TransactionClientContract
  ): Promise<ReserveRatePeriod | null> {
    const upTo = await this.#ratePeriods(workspaceId, accountId, trx)
      .whereRaw('(effective_year * 12 + effective_month) <= ?', [year * 12 + month])
      .orderBy('effective_year', 'desc')
      .orderBy('effective_month', 'desc')
      .first()

    if (upTo) return upTo

    return this.#ratePeriods(workspaceId, accountId, trx)
      .orderBy('effective_year', 'asc')
      .orderBy('effective_month', 'asc')
      .first()
  }

  /**
   * CDI ANUAL (percentual) do mês de competência, com carry-forward (§3.4).
   *
   * `cdi_rates` é esparsa: a linha de jan/2026 vale para fev, mar… até aparecer uma linha
   * nova. Logo pegamos a vigência mais recente `<= (year, month)`:
   *   - vigência do próprio mês  → `source: 'exact'`
   *   - vigência de um mês antes → `source: 'carry'`
   *   - nenhuma vigência         → `DEFAULT_CDI_ANNUAL` com `source: 'default'`
   *
   * Nunca devolve `null`: a ausência de CDI é um valor estimado ROTULADO, não um erro —
   * quem consome mostra o badge "CDI estimado" quando `source !== 'exact'`.
   *
   * @param workspaceId escopo (1º parâmetro, sempre)
   * @param year        ano de competência
   * @param month       mês de competência (1..12)
   * @param trx         transação do chamador; nunca abrimos uma própria
   */
  async resolveCdiAnnual(
    workspaceId: number,
    year: number,
    month: number,
    trx?: TransactionClientContract
  ): Promise<ResolvedCdi> {
    const key = year * 12 + month

    const query = CdiRate.query()
      .where('workspace_id', workspaceId)
      .whereRaw('(year * 12 + month) <= ?', [key])
      .orderBy('year', 'desc')
      .orderBy('month', 'desc')
    if (trx) query.useTransaction(trx)

    const row = await query.first()
    if (!row) {
      return { annualRate: DEFAULT_CDI_ANNUAL, source: 'default', year: null, month: null }
    }

    const rowYear = Number(row.year)
    const rowMonth = Number(row.month)
    return {
      // decimal → string no banco: Number() em toda fronteira (§4)
      annualRate: Number(row.annualRate),
      source: rowYear * 12 + rowMonth === key ? 'exact' : 'carry',
      year: rowYear,
      month: rowMonth,
    }
  }

  /**
   * Vigência + CDI + taxa efetiva mensal do mês, num único passo — o que a apuração (§5.7)
   * e o rendimento parcial (§5.6) precisam antes de tocar no razão.
   *
   * O CDI só é resolvido quando `rateKind = 'cdi'`, para não gravar `yield_cdi_annual` em
   * conta que não é indexada ao CDI. `i` vem `null` quando `effectiveMonthlyRate` não
   * consegue resolver a taxa — o chamador transforma isso no skip `cdi_missing`.
   *
   * @returns `null` quando a conta não tem nenhuma vigência de taxa cadastrada
   */
  async resolveMonthlyRate(
    workspaceId: number,
    accountId: number,
    year: number,
    month: number,
    trx?: TransactionClientContract
  ): Promise<ResolvedMonthlyRate | null> {
    const period = await this.resolveRatePeriod(workspaceId, accountId, year, month, trx)
    if (!period) return null

    // enum → string no schema gerado: o estreitamento é explícito aqui (§4)
    const kind = period.rateKind as RateKind
    const value = Number(period.rateValue)

    const cdi = kind === 'cdi' ? await this.resolveCdiAnnual(workspaceId, year, month, trx) : null

    return {
      period,
      kind,
      value,
      cdi,
      i: effectiveMonthlyRate(kind, value, cdi?.annualRate ?? null),
    }
  }

  /**
   * Query base de vigências, já escopada por workspace + conta e já dentro da transação
   * do chamador quando existe.
   */
  #ratePeriods(workspaceId: number, accountId: number, trx?: TransactionClientContract) {
    const query = ReserveRatePeriod.query()
      .where('workspace_id', workspaceId)
      .where('reserve_account_id', accountId)
    if (trx) query.useTransaction(trx)
    return query
  }
}
