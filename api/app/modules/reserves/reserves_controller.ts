import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import CdiRate from '#models/cdi_rate'
import ReserveAccount from '#models/reserve_account'
import LedgerService from '#modules/reserves/ledger_service'
import type { MovementKind, StatementLine } from '#modules/reserves/ledger_service'
import RateService from '#modules/reserves/rate_service'
import type { CdiSource } from '#modules/reserves/rate_service'
import ReserveAccountService from '#modules/reserves/reserve_account_service'
import ReserveMovementService from '#modules/reserves/reserve_movement_service'
import YieldService from '#modules/reserves/yield_service'
import { effectiveMonthlyRate, fromCents } from '#modules/reserves/interest'
import {
  accountsQueryValidator,
  cdiQueryValidator,
  closeYieldValidator,
  createAccountValidator,
  createMovementValidator,
  movementsQueryValidator,
  reconcileValidator,
  statementQueryValidator,
  summaryQueryValidator,
  updateAccountValidator,
  updateMovementValidator,
  upsertCdiValidator,
} from '#modules/reserves/reserve_validator'

/**
 * Formato das colunas `date` do MySQL. Toda data devolvida no JSON passa por aqui —
 * NUNCA `new Date(string)` (§4: em UTC-3 um `new Date('2026-07-01')` vira 30/06).
 */
const SQL_DATE = 'yyyy-MM-dd'

/** Janela default do extrato quando o cliente não manda `year`/`month` (§6.6). */
const STATEMENT_MONTHS = 12

/** Casas do `mensalEquivalente` no JSON — a mesma precisão de `yield_rate_applied` (§3.3). */
const MONTHLY_RATE_DIGITS = 10

/** Casas de `cdi_rates.annual_rate` — `decimal(9,6)` (§3.4). */
const CDI_RATE_DIGITS = 6

/** A memória de cálculo congelada numa linha `kind='yield'`, como sai em §6.6. */
export interface StatementYieldView {
  /** `'YYYY-MM'` do mês de competência */
  period: string | null
  /** decimal(14,6) do banco → STRING (`"12285.056667"`) */
  base: string | null
  rateKind: string | null
  /** decimal(9,6) do banco → STRING (`"102.000000"`) */
  rateSource: string | null
  /** decimal(12,10) do banco → STRING, em FRAÇÃO (`"0.0118757178"`) */
  rateApplied: string | null
  /** decimal(9,6) do banco → STRING (`"14.900000"`); `null` fora de `kind='cdi'` */
  cdiAnnual: string | null
  /** origem do CDI do mês, resolvida na leitura; `null` fora de `kind='cdi'` */
  cdiSource: CdiSource | null
}

/** Uma linha do extrato de §6.6, já com saldo corrente. */
export interface StatementLineView {
  id: string
  kind: MovementKind
  /** `YYYY-MM-DD` */
  occurredOn: string
  /** decimal(12,2) do banco → STRING ASSINADA (`"-2000.00"` num saque) */
  amount: string
  /** derivado em JS → NÚMERO, para a UI não reparsear a string */
  signedAmount: number
  description: string | null
  /** agregado em JS → NÚMERO: saldo da conta DEPOIS desta linha */
  saldoApos: number
  /** `false` em `kind='yield'`: rendimento só muda reexecutando a apuração (§6.10) */
  editavel: boolean
  yield: StatementYieldView | null
}

/** Payload de `GET /reserves/accounts/:id/statement` (§6.6). */
export interface StatementView {
  accountId: string
  /** `YYYY-MM-DD`, início do intervalo (INCLUSIVO) */
  from: string
  /** `YYYY-MM-DD`, fim do intervalo (INCLUSIVO) */
  to: string
  /** agregado em JS → NÚMERO */
  saldoInicial: number
  saldoFinal: number
  /** do mais RECENTE ao mais antigo — o acúmulo do saldo é feito no `LedgerService` */
  movements: StatementLineView[]
}

/**
 * HTTP das caixinhas de reserva (§6): 14 rotas num grupo só, todas atrás de
 * `[auth, currentWorkspace]`, todas escopadas por `Number(workspace.id)`.
 *
 * **REGRA HÍBRIDA DE DINHEIRO (§1.3), declarada aqui e aplicada em todo o módulo:**
 *
 *   campo que vem DIRETO de uma coluna `decimal` → **STRING** (`"12693.55"`, como
 *   `/items` e `/entries`): `amount`, `goalAmount`, `rate.value`, `annualRate` e toda a
 *   memória de cálculo `yield.*`;
 *
 *   campo AGREGADO ou derivado em JS → **NÚMERO** (como `/dashboard`): `saldo`,
 *   `signedAmount`, `saldoApos`, `totalRendimento`, taxas em fração e progresso de meta.
 *
 * Regras duras deste controller:
 * - o 404 nasce de `firstOrFail()` sobre uma query JÁ escopada por workspace, nunca de um
 *   `throw` manual (padrão de `items`/`categories`);
 * - todo id de rota atravessa `Number(params.id)` — `bigIncrements` chega como
 *   `bigint | number` e a rota entrega string (§4);
 * - nenhuma conta de dinheiro mora aqui: os endpoints agregados só transpõem centavos
 *   inteiros dos services para reais com `fromCents` (§5.1).
 */
@inject()
export default class ReservesController {
  constructor(
    private accountService: ReserveAccountService,
    private movementService: ReserveMovementService,
    private yieldService: YieldService,
    private ledgerService: LedgerService,
    private rateService: RateService
  ) {}

  /**
   * GET /api/v1/reserves/summary?year=&month=
   * Consolidado do workspace (§6.1): total guardado, rendimento parcial/previsto do mês,
   * evolução de 12 meses e o estado da apuração. Sem `year`/`month`, o mês corrente.
   */
  async summary({ request, workspace, response }: HttpContext) {
    const { year, month } = await summaryQueryValidator.validate(request.qs())
    const now = DateTime.now()
    const view = await this.accountService.summary(
      Number(workspace.id),
      year ?? now.year,
      month ?? now.month
    )
    return response.ok(view)
  }

  /**
   * GET /api/v1/reserves/cdi?year=
   * CDI vigente hoje (com carry-forward e fallback `default`) + o histórico do ano (§6.12).
   * `mensalEquivalente` é a taxa de 100% do CDI em FRAÇÃO — o número que o chip da UI mostra.
   */
  async cdiIndex({ request, workspace, response }: HttpContext) {
    const { year } = await cdiQueryValidator.validate(request.qs())
    const workspaceId = Number(workspace.id)
    const now = DateTime.now()

    const vigente = await this.rateService.resolveCdiAnnual(workspaceId, now.year, now.month)
    const mensal = effectiveMonthlyRate('cdi', 100, vigente.annualRate)

    const rows = await CdiRate.query()
      .where('workspace_id', workspaceId)
      .where('year', year ?? now.year)
      .orderBy('year', 'desc')
      .orderBy('month', 'desc')

    return response.ok({
      vigenteHoje: {
        annualRate: vigente.annualRate,
        source: vigente.source,
        year: vigente.year,
        month: vigente.month,
        mensalEquivalente: mensal === null ? null : Number(mensal.toFixed(MONTHLY_RATE_DIGITS)),
      },
      historico: rows.map((row) => ({
        id: String(row.id),
        year: Number(row.year),
        month: Number(row.month),
        // decimal(9,6) do banco → STRING (§1.3)
        annualRate: row.annualRate,
      })),
    })
  }

  /**
   * PUT /api/v1/reserves/cdi
   * Cadastra ou atualiza o CDI ANUAL a partir de um mês (§6.12). É PUT porque a operação é
   * um `updateOrCreate` por `(workspace, year, month)` — mandar o mesmo corpo duas vezes
   * deixa o banco no mesmo estado.
   *
   * `contasEmCdi` e `recalcularSugerido` existem para a UI dizer o que essa digitação
   * mexeu: quantas caixinhas seguem o CDI e se alguma delas já tinha meses apurados com o
   * valor antigo.
   */
  async cdiUpsert({ request, workspace, response }: HttpContext) {
    const { year, month, annualRate } = await request.validateUsing(upsertCdiValidator)
    const workspaceId = Number(workspace.id)

    const row = await CdiRate.updateOrCreate(
      { workspaceId, year, month },
      { annualRate: annualRate.toFixed(CDI_RATE_DIGITS) }
    )

    const accounts = await this.accountService.list(workspaceId)
    const emCdi = accounts.filter((account) => account.rate?.kind === 'cdi')
    const key = year * 12 + month

    return response.ok({
      id: String(row.id),
      year: Number(row.year),
      month: Number(row.month),
      // decimal(9,6) do banco → STRING (§1.3)
      annualRate: row.annualRate,
      contasEmCdi: emCdi.length,
      recalcularSugerido: emCdi.some((account) => {
        const closed = this.#periodKey(account.lastClosedPeriod)
        return closed !== null && closed >= key
      }),
    })
  }

  /**
   * POST /api/v1/reserves/yield/close
   * Apura o rendimento da abertura de cada caixinha até o mês-alvo (§6.11). Sempre total e
   * idempotente: rodar de novo com as mesmas entradas produz bytes idênticos. Sem `year`/
   * `month`, o alvo é o mês anterior ao corrente — o mês em curso nunca é fechado (§5.7).
   */
  async closeYield({ request, workspace, response }: HttpContext) {
    const { year, month, accountId } = await request.validateUsing(closeYieldValidator)
    const result = await this.yieldService.closeThrough(Number(workspace.id), {
      year,
      month,
      accountId,
    })
    return response.ok(result)
  }

  /**
   * GET /api/v1/reserves/movements?accountId=&kind=&from=&to=&limit=
   * Lista plana de movimentos de TODAS as caixinhas (§6.8), do mais recente ao mais antigo,
   * com nome e cor da conta embutidos.
   */
  async movementsIndex({ request, workspace, response }: HttpContext) {
    const { accountId, kind, from, to, limit } = await movementsQueryValidator.validate(
      request.qs()
    )
    const movements = await this.movementService.list(Number(workspace.id), {
      accountId,
      kind,
      from,
      to,
      limit,
    })
    return response.ok(movements)
  }

  /**
   * POST /api/v1/reserves/movements
   * Registra um depósito ou um saque (§6.9). `amount` entra sempre POSITIVO e quem assina o
   * valor é o service; `opening`, `adjustment` e `yield` não são alcançáveis por esta rota.
   */
  async movementsStore({ request, workspace, response }: HttpContext) {
    const data = await request.validateUsing(createMovementValidator)
    const movement = await this.movementService.create(Number(workspace.id), data)
    return response.created(movement)
  }

  /**
   * PATCH /api/v1/reserves/movements/:id
   * Edita um lançamento (§6.10). A query do service carrega `.whereNot('kind', 'yield')`:
   * editar um rendimento devolve 404 naturalmente.
   */
  async movementsUpdate({ params, request, workspace, response }: HttpContext) {
    const data = await request.validateUsing(updateMovementValidator)
    const movement = await this.movementService.update(
      Number(workspace.id),
      Number(params.id),
      data
    )
    return response.ok(movement)
  }

  /**
   * DELETE /api/v1/reserves/movements/:id
   * Apaga um lançamento (§6.10) — 404 em `kind='yield'`, pela mesma cláusula do PATCH.
   */
  async movementsDestroy({ params, workspace, response }: HttpContext) {
    const result = await this.movementService.destroy(Number(workspace.id), Number(params.id))
    return response.ok(result)
  }

  /**
   * GET /api/v1/reserves/accounts?includeArchived=
   * Lista as caixinhas do workspace com taxa resolvida, saldos derivados, rendimento
   * parcial/previsto e progresso da meta (§6.2). Sem `includeArchived`, só as ativas.
   */
  async index({ request, workspace, response }: HttpContext) {
    const { includeArchived } = await accountsQueryValidator.validate(request.qs())
    const accounts = await this.accountService.list(Number(workspace.id), { includeArchived })
    return response.ok(accounts)
  }

  /**
   * POST /api/v1/reserves/accounts
   * Cria a caixinha + a primeira vigência de taxa + (quando `saldoInicial > 0`) o movimento
   * `opening`, tudo na mesma transação (§6.3).
   */
  async store({ request, workspace, response }: HttpContext) {
    const data = await request.validateUsing(createAccountValidator)
    const account = await this.accountService.create(Number(workspace.id), data)
    return response.created(account)
  }

  /**
   * GET /api/v1/reserves/accounts/:id/statement?year=&month=
   * Extrato com saldo corrente linha a linha (§6.6). Com `year` e `month`, o mês; só com
   * `year`, o ano inteiro; sem nenhum dos dois, os últimos 12 meses.
   *
   * A conta é buscada com `firstOrFail()` escopado ANTES do razão: extrato de outro
   * workspace é 404, não uma lista vazia.
   */
  async statement({ params, request, workspace, response }: HttpContext) {
    const { year, month } = await statementQueryValidator.validate(request.qs())
    const workspaceId = Number(workspace.id)

    const account = await ReserveAccount.query()
      .where('workspace_id', workspaceId)
      .where('id', Number(params.id))
      .firstOrFail()

    const accountId = Number(account.id)
    const { from, to } = this.#statementRange(year, month)
    const statement = await this.ledgerService.statement(workspaceId, accountId, from, to)

    // Uma resolução de CDI por período de competência, reaproveitada entre as linhas.
    const cdiSources = new Map<string, CdiSource>()
    const movements: StatementLineView[] = []

    for (const line of [...statement.movements].reverse()) {
      movements.push({
        id: String(line.id),
        kind: line.kind,
        occurredOn: line.occurredOn.toFormat(SQL_DATE),
        amount: line.amount,
        signedAmount: this.#reais(line.amountCents),
        description: line.description,
        saldoApos: this.#reais(line.saldoAposCents),
        editavel: line.kind !== 'yield',
        yield: await this.#yieldView(workspaceId, line, cdiSources),
      })
    }

    const view: StatementView = {
      accountId: String(accountId),
      from: from.toFormat(SQL_DATE),
      to: to.toFormat(SQL_DATE),
      saldoInicial: this.#reais(statement.saldoInicialCents),
      saldoFinal: this.#reais(statement.saldoFinalCents),
      movements,
    }
    return response.ok(view)
  }

  /**
   * POST /api/v1/reserves/accounts/:id/reconcile
   * "Quanto tem hoje na caixinha, segundo o banco?" (§6.7): o service calcula o delta e
   * grava um `adjustment` (nada é gravado quando o delta é zero). É a única forma de criar
   * um ajuste — e o ajuste conta como RENDIMENTO, não como aporte.
   */
  async reconcile({ params, request, workspace, response }: HttpContext) {
    const data = await request.validateUsing(reconcileValidator)
    const result = await this.movementService.reconcile(
      Number(workspace.id),
      Number(params.id),
      data
    )
    return response.ok(result)
  }

  /**
   * PATCH /api/v1/reserves/accounts/:id
   * Atualiza a caixinha (§6.4). `openedAt` é imutável; `rateKind`/`rateValue` criam a
   * vigência do MÊS CORRENTE em vez de reescrever o passado. Cross-workspace → 404.
   */
  async update({ params, request, workspace, response }: HttpContext) {
    const data = await request.validateUsing(updateAccountValidator)
    const account = await this.accountService.update(Number(workspace.id), Number(params.id), data)
    return response.ok(account)
  }

  /**
   * DELETE /api/v1/reserves/accounts/:id
   * Sem movimentos → apaga de verdade; com movimentos → arquiva (§6.5). Devolve SEMPRE as
   * duas chaves (`{ archived, deleted }`), como `items`/`categories`.
   */
  async destroy({ params, workspace, response }: HttpContext) {
    const result = await this.accountService.destroy(Number(workspace.id), Number(params.id))
    return response.ok(result)
  }

  /**
   * Intervalo do extrato (§6.6). As datas nascem de `DateTime.fromObject`/`now()`, nunca de
   * `new Date(string)`.
   */
  #statementRange(year?: number, month?: number): { from: DateTime; to: DateTime } {
    // `month` sem `year` significa "esse mês do ano corrente". Ignorá-lo (caindo nos
    // últimos 12 meses) devolveria 200 com o intervalo errado — um filtro que some
    // em silêncio é pior que um erro.
    const resolvedYear = year ?? (month !== undefined ? DateTime.now().year : undefined)

    if (resolvedYear !== undefined && month !== undefined) {
      const from = DateTime.fromObject({ year: resolvedYear, month, day: 1 })
      return { from, to: from.endOf('month') }
    }

    if (year !== undefined) {
      return {
        from: DateTime.fromObject({ year, month: 1, day: 1 }),
        to: DateTime.fromObject({ year, month: 12, day: 1 }).endOf('month'),
      }
    }

    const now = DateTime.now()
    return {
      from: now.startOf('month').minus({ months: STATEMENT_MONTHS - 1 }),
      to: now.endOf('month'),
    }
  }

  /**
   * Memória de cálculo de uma linha do extrato; `null` fora de `kind='yield'`.
   *
   * `cdiSource` NÃO está congelado na linha (§3.3 grava o valor do CDI, não a origem dele):
   * é resolvido agora, pelo mês de competência, e serve só para a UI mostrar o badge
   * "CDI estimado" quando a taxa não veio de uma vigência exata.
   */
  async #yieldView(
    workspaceId: number,
    line: StatementLine,
    cache: Map<string, CdiSource>
  ): Promise<StatementYieldView | null> {
    if (line.kind !== 'yield') return null

    let cdiSource: CdiSource | null = null
    if (line.yieldRateKind === 'cdi' && line.yieldPeriod !== null) {
      const cached = cache.get(line.yieldPeriod)
      if (cached !== undefined) {
        cdiSource = cached
      } else {
        const period = DateTime.fromISO(`${line.yieldPeriod}-01`)
        const resolved = await this.rateService.resolveCdiAnnual(
          workspaceId,
          period.year,
          period.month
        )
        cache.set(line.yieldPeriod, resolved.source)
        cdiSource = resolved.source
      }
    }

    return {
      period: line.yieldPeriod,
      base: line.yieldBase,
      rateKind: line.yieldRateKind,
      rateSource: line.yieldRateSource,
      rateApplied: line.yieldRateApplied,
      cdiAnnual: line.yieldCdiAnnual,
      cdiSource,
    }
  }

  /** `'YYYY-MM'` → `ano * 12 + mês`; `null` quando nada foi apurado ainda. */
  #periodKey(period: string | null): number | null {
    if (period === null) return null
    const [year, month] = period.split('-').map(Number)
    if (!Number.isFinite(year) || !Number.isFinite(month)) return null
    return year * 12 + month
  }

  /**
   * CENTAVOS inteiros → reais como NÚMERO, via `fromCents` (a mesma travessia de fronteira
   * do resto do módulo) — campo agregado sai número, nunca string (§1.3).
   */
  #reais(cents: number): number {
    return Number(fromCents(cents))
  }
}
