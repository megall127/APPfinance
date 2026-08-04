import ReserveAccount from '#models/reserve_account'
import ReserveMovement from '#models/reserve_movement'
import LedgerService from '#modules/reserves/ledger_service'
import type { MovementKind } from '#modules/reserves/ledger_service'
import { fromCents, toCents } from '#modules/reserves/interest'
import { inject } from '@adonisjs/core'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'

/**
 * Formato de data aceito pelas colunas `date` do MySQL. Toda data que entra numa
 * cláusula SQL passa por aqui — NUNCA `new Date(string)` (§13: em UTC-3 um
 * `new Date('2026-07-01')` vira 30/06 e joga o movimento no mês errado).
 */
const SQL_DATE = 'yyyy-MM-dd'

/** Tamanho de página da lista plana de §6.8 quando o cliente não manda `limit`. */
const DEFAULT_LIMIT = 50

/** Filtros de `GET /api/v1/reserves/movements` (§6.8); todos opcionais. */
export interface MovementFilters {
  /** restringe a uma caixinha (sempre dentro do workspace atual) */
  accountId?: number
  /** enum COMPLETO: a leitura pode filtrar `yield`/`opening`/`adjustment` */
  kind?: MovementKind
  /** `YYYY-MM-DD`, início do intervalo (INCLUSIVO) */
  from?: string
  /** `YYYY-MM-DD`, fim do intervalo (INCLUSIVO) */
  to?: string
  /** 1..500; default `DEFAULT_LIMIT` */
  limit?: number
}

/**
 * Uma linha da lista plana de §6.8, com o nome e a cor da conta já embutidos pelo join
 * (a UI mostra movimentos de TODAS as caixinhas juntos e precisa do rótulo colorido).
 */
export interface MovementListItem {
  id: string
  accountId: string
  accountName: string
  accountColor: string | null
  kind: MovementKind
  /** `YYYY-MM-DD` */
  occurredOn: string
  /** decimal(12,2) do banco → STRING ASSINADA (`"-2000.00"` num saque) */
  amount: string
  /** derivado em JS → NÚMERO, para a UI não reparsear a string */
  signedAmount: number
  description: string | null
}

/** Payload de `POST /reserves/movements` (§6.9); `amount` entra sempre POSITIVO. */
export interface CreateMovementDto {
  accountId: number
  kind: 'deposit' | 'withdrawal'
  /** `YYYY-MM-DD` */
  occurredOn: string
  /** reais > 0 — quem assina o valor é o service */
  amount: number
  description?: string
}

/** Payload de `PATCH /reserves/movements/:id` (§6.10); `accountId` é imutável. */
export interface UpdateMovementDto {
  kind?: 'deposit' | 'withdrawal'
  /** `YYYY-MM-DD` */
  occurredOn?: string
  /** reais > 0 — quem assina o valor é o service */
  amount?: number
  description?: string
}

/** Resposta de `POST`/`PATCH` de movimento (§6.9). */
export interface MovementWriteResult {
  id: string
  accountId: string
  kind: MovementKind
  /** `YYYY-MM-DD` */
  occurredOn: string
  /** decimal(12,2) do banco → STRING ASSINADA */
  amount: string
  /** derivado em JS → NÚMERO */
  signedAmount: number
  description: string | null
  /** agregado em JS → NÚMERO: saldo ATUAL da caixinha (todos os movimentos) */
  saldoDaConta: number
  /** o razão registra fatos: saldo negativo NÃO é bloqueado, só sinalizado (§6.9) */
  saldoNegativo: boolean
  /** `true` quando o lançamento toca um mês que a apuração já fechou */
  recalcularSugerido: boolean
}

/** Resposta de `DELETE /reserves/movements/:id` (§6.10). */
export interface DeleteMovementResult {
  deleted: boolean
  /** agregado em JS → NÚMERO */
  saldoDaConta: number
  recalcularSugerido: boolean
}

/** Payload de `POST /reserves/accounts/:id/reconcile` (§6.7). */
export interface ReconcileDto {
  /** reais >= 0: o saldo REAL lido no extrato do banco */
  balance: number
  /** `YYYY-MM-DD`; default: hoje */
  occurredOn?: string
  description?: string
}

/** Resposta de `POST /reserves/accounts/:id/reconcile` (§6.7). */
export interface ReconcileResult {
  /** `false` quando `delta === 0` — nada foi gravado */
  adjusted: boolean
  /** reais ASSINADOS: `balance − saldo(occurredOn)` */
  delta: number
  /** id do `adjustment` criado; `null` no no-op */
  movementId: string | null
  /** reais: saldo derivado em `occurredOn` ANTES do ajuste */
  saldoAnterior: number
  /** reais: saldo derivado em `occurredOn` DEPOIS do ajuste */
  saldoAtual: number
  recalcularSugerido: boolean
}

/**
 * Escrita do razão das caixinhas: depósitos, saques e a reconciliação com o extrato
 * do banco (§6.7 a §6.10).
 *
 * Regras duras deste service:
 * - `workspaceId: number` é SEMPRE o 1º parâmetro e toda query começa por
 *   `.where('workspace_id', workspaceId)` — o 404 nasce de `firstOrFail()` sobre a
 *   query já escopada, nunca de um `throw` de domínio;
 * - `update`/`destroy` carregam `.whereNot('kind', 'yield')`: tentar editar ou apagar
 *   um rendimento devolve 404 NATURALMENTE (§6.10). Rendimento só muda reexecutando
 *   a apuração;
 * - `opening` nasce de `POST/PATCH /accounts`, `adjustment` só de `reconcile()` e
 *   `yield` só do `YieldService` — `create()` só aceita `deposit`/`withdrawal`;
 * - dinheiro é somado em CENTAVOS INTEIROS (`toCents`/`fromCents`), jamais em float;
 * - datas só nascem de `DateTime.fromISO`/`fromJSDate`/`now()` e viram string com
 *   `SQL_DATE`;
 * - **saldo negativo não é bloqueado**: o razão registra fatos, a resposta sinaliza
 *   (`saldoNegativo`) e a UI avisa ANTES de gravar.
 */
@inject()
export default class ReserveMovementService {
  constructor(private ledger: LedgerService) {}

  /**
   * Lista plana de movimentos do workspace (§6.8), do mais recente para o mais antigo.
   *
   * O join com `reserve_accounts` embute `accountName`/`accountColor` numa query só —
   * a aba "Movimentações" mistura todas as caixinhas e sem isso seria um N+1.
   *
   * @param workspaceId escopo (1º parâmetro, sempre)
   * @param filters     conta, kind, intervalo e limite (§6.8)
   * @returns linhas ordenadas por `(occurred_on DESC, id DESC)`, no máximo `limit`
   */
  async list(workspaceId: number, filters: MovementFilters = {}): Promise<MovementListItem[]> {
    const query = db
      .from('reserve_movements as m')
      .join('reserve_accounts as a', 'a.id', 'm.reserve_account_id')
      .where('m.workspace_id', workspaceId)
      .select(
        'm.id as id',
        'm.reserve_account_id as reserve_account_id',
        'm.kind as kind',
        'm.occurred_on as occurred_on',
        'm.amount as amount',
        'm.description as description',
        'a.name as account_name',
        'a.color as account_color'
      )
      .orderBy('m.occurred_on', 'desc')
      .orderBy('m.id', 'desc')
      .limit(filters.limit ?? DEFAULT_LIMIT)

    if (filters.accountId !== undefined) query.where('m.reserve_account_id', filters.accountId)
    if (filters.kind !== undefined) query.where('m.kind', filters.kind)
    if (filters.from !== undefined) {
      query.where('m.occurred_on', '>=', DateTime.fromISO(filters.from).toFormat(SQL_DATE))
    }
    if (filters.to !== undefined) {
      query.where('m.occurred_on', '<=', DateTime.fromISO(filters.to).toFormat(SQL_DATE))
    }

    const rows = await query
    return rows.map((row) => ({
      id: String(row.id),
      accountId: String(row.reserve_account_id),
      accountName: String(row.account_name),
      accountColor: row.account_color ?? null,
      kind: row.kind as MovementKind,
      occurredOn: this.#isoDate(row.occurred_on),
      amount: String(row.amount),
      signedAmount: Number(row.amount),
      description: row.description ?? null,
    }))
  }

  /**
   * Grava um depósito ou saque (§6.9).
   *
   * A conta é conferida com `firstOrFail()` escopado ANTES de gravar (cross-workspace
   * → 404) e o sinal é normalizado aqui: `deposit → +abs(v)`, `withdrawal → −abs(v)`.
   * O validator manda o valor sempre positivo.
   *
   * @param workspaceId escopo (1º parâmetro, sempre)
   * @param dto         conta, kind, data, valor POSITIVO e descrição
   * @returns o movimento gravado + saldo da conta, alerta de saldo negativo e
   *          `recalcularSugerido`
   */
  async create(workspaceId: number, dto: CreateMovementDto): Promise<MovementWriteResult> {
    const account = await this.#account(workspaceId, dto.accountId)
    const occurredOn = DateTime.fromISO(dto.occurredOn)

    const movement = await ReserveMovement.create({
      workspaceId,
      reserveAccountId: Number(account.id),
      kind: dto.kind,
      occurredOn,
      amount: fromCents(this.#signedCents(dto.kind, toCents(dto.amount))),
      description: dto.description ?? null,
    })

    return this.#writeResult(workspaceId, account, movement, occurredOn)
  }

  /**
   * Edita um depósito/saque/abertura/ajuste já gravado (§6.10).
   *
   * A query carrega `.whereNot('kind', 'yield')`, portanto tentar editar um rendimento
   * cai no `firstOrFail()` e vira 404 — sem `throw` manual.
   *
   * O sinal é SEMPRE rederivado do kind final: trocar `deposit` por `withdrawal` sem
   * mandar `amount` inverte o valor que já estava gravado.
   *
   * @param workspaceId escopo (1º parâmetro, sempre)
   * @param id          id do movimento
   * @param dto         campos de §6.9, todos opcionais e sem `accountId` (imutável)
   * @returns o movimento atualizado, no mesmo shape de `create()`
   */
  async update(
    workspaceId: number,
    id: number,
    dto: UpdateMovementDto
  ): Promise<MovementWriteResult> {
    const movement = await this.#editableMovement(workspaceId, id)
    const account = await this.#account(workspaceId, Number(movement.reserveAccountId))

    // mês de ANTES da edição: mover um lançamento para FORA de um mês já apurado
    // muda a base daquele mês exatamente como mover para DENTRO dele
    const previousOn = movement.occurredOn
    const storedCents = toCents(movement.amount)

    if (dto.kind !== undefined) movement.kind = dto.kind
    if (dto.occurredOn !== undefined) movement.occurredOn = DateTime.fromISO(dto.occurredOn)
    if (dto.description !== undefined) movement.description = dto.description

    if (dto.amount !== undefined || dto.kind !== undefined) {
      const magnitudeCents = dto.amount !== undefined ? toCents(dto.amount) : storedCents
      const kind = movement.kind as MovementKind
      movement.amount = fromCents(this.#signedCents(kind, magnitudeCents, storedCents))
    }

    await movement.save()

    return this.#writeResult(workspaceId, account, movement, previousOn)
  }

  /**
   * Apaga um movimento (§6.10). A query carrega `.whereNot('kind', 'yield')`: apagar um
   * rendimento devolve 404 naturalmente.
   *
   * @param workspaceId escopo (1º parâmetro, sempre)
   * @param id          id do movimento
   * @returns `{ deleted, saldoDaConta, recalcularSugerido }`
   */
  async destroy(workspaceId: number, id: number): Promise<DeleteMovementResult> {
    const movement = await this.#editableMovement(workspaceId, id)
    const account = await this.#account(workspaceId, Number(movement.reserveAccountId))
    const occurredOn = movement.occurredOn

    await movement.delete()

    const saldoCents = await this.ledger.balanceCents(workspaceId, Number(account.id))
    return {
      deleted: true,
      saldoDaConta: this.#reais(saldoCents),
      recalcularSugerido: this.#recalcularSugerido(account, occurredOn),
    }
  }

  /**
   * "Quanto tem hoje na caixinha, segundo o banco?" (§6.7).
   *
   * Calcula `delta = toCents(balance) − saldo(occurredOn)` e grava UM movimento
   * `kind='adjustment'` com o delta assinado. Quando o delta é zero não grava nada —
   * reconciliar duas vezes seguidas não polui o extrato com ajustes de R$ 0,00.
   *
   * É a ÚNICA forma de criar um `adjustment`, e o ajuste conta como RENDIMENTO
   * (`totalRendimento = Σ yield + Σ adjustment`): a divergência contra o extrato é,
   * esmagadoramente, rendimento real não modelado.
   *
   * @param workspaceId escopo (1º parâmetro, sempre)
   * @param accountId   id da caixinha
   * @param dto         saldo real do extrato, data (default hoje) e descrição
   * @returns `{ adjusted, delta, movementId, saldoAnterior, saldoAtual, recalcularSugerido }`
   */
  async reconcile(
    workspaceId: number,
    accountId: number,
    dto: ReconcileDto
  ): Promise<ReconcileResult> {
    const account = await this.#account(workspaceId, accountId)
    const occurredOn = dto.occurredOn
      ? DateTime.fromISO(dto.occurredOn)
      : DateTime.now().startOf('day')

    const saldoAnteriorCents = await this.ledger.balanceCents(
      workspaceId,
      Number(account.id),
      occurredOn
    )
    const deltaCents = toCents(dto.balance) - saldoAnteriorCents

    if (deltaCents === 0) {
      return {
        adjusted: false,
        delta: 0,
        movementId: null,
        saldoAnterior: this.#reais(saldoAnteriorCents),
        saldoAtual: this.#reais(saldoAnteriorCents),
        recalcularSugerido: false,
      }
    }

    const movement = await ReserveMovement.create({
      workspaceId,
      reserveAccountId: Number(account.id),
      kind: 'adjustment',
      occurredOn,
      // o delta já é ASSINADO: saldo do banco menor que o do razão vira ajuste negativo
      amount: fromCents(deltaCents),
      description: dto.description ?? null,
    })

    return {
      adjusted: true,
      delta: this.#reais(deltaCents),
      movementId: String(movement.id),
      saldoAnterior: this.#reais(saldoAnteriorCents),
      saldoAtual: this.#reais(saldoAnteriorCents + deltaCents),
      recalcularSugerido: this.#recalcularSugerido(account, occurredOn),
    }
  }

  /**
   * Conta do workspace ou 404 — `firstOrFail()` sobre query já escopada é o único
   * mecanismo de 404 do módulo (§6.4).
   */
  #account(workspaceId: number, accountId: number) {
    return ReserveAccount.query()
      .where('workspace_id', workspaceId)
      .where('id', accountId)
      .firstOrFail()
  }

  /**
   * Movimento EDITÁVEL do workspace ou 404. O `.whereNot('kind', 'yield')` é o que faz
   * `PATCH`/`DELETE` de um rendimento devolver 404 sem nenhum `throw` de domínio (§6.10).
   */
  #editableMovement(workspaceId: number, id: number) {
    return ReserveMovement.query()
      .where('workspace_id', workspaceId)
      .where('id', id)
      .whereNot('kind', 'yield')
      .firstOrFail()
  }

  /**
   * Monta a resposta de escrita de §6.9 relendo o saldo do razão (nunca de uma coluna).
   *
   * @param alsoTouched mês adicional afetado pela escrita — na edição é a data ANTIGA
   *                    do movimento, que pode estar num mês já apurado mesmo quando a
   *                    data nova não está
   */
  async #writeResult(
    workspaceId: number,
    account: ReserveAccount,
    movement: ReserveMovement,
    alsoTouched: DateTime
  ): Promise<MovementWriteResult> {
    const saldoCents = await this.ledger.balanceCents(workspaceId, Number(account.id))

    return {
      id: String(movement.id),
      accountId: String(account.id),
      kind: movement.kind as MovementKind,
      occurredOn: movement.occurredOn.toFormat(SQL_DATE),
      amount: movement.amount,
      signedAmount: Number(movement.amount),
      description: movement.description,
      saldoDaConta: this.#reais(saldoCents),
      saldoNegativo: saldoCents < 0,
      recalcularSugerido:
        this.#recalcularSugerido(account, movement.occurredOn) ||
        this.#recalcularSugerido(account, alsoTouched),
    }
  }

  /**
   * `true` quando a data cai num mês que a apuração JÁ fechou (§6.9) — mexer ali muda a
   * base de um `yield` gravado e a UI oferece "Atualizar rendimentos".
   *
   * A comparação é por ARITMÉTICA `ano * 12 + mês`, jamais por ordenação de strings.
   */
  #recalcularSugerido(account: ReserveAccount, occurredOn: DateTime): boolean {
    const closed = this.#periodKey(account.lastClosedPeriod)
    if (closed === null) return false
    return occurredOn.year * 12 + occurredOn.month <= closed
  }

  /**
   * `'YYYY-MM'` → `ano * 12 + mês`. `null` quando a conta nunca foi apurada ou quando o
   * valor da coluna é ilegível (nada a recalcular nos dois casos).
   */
  #periodKey(period: string | null): number | null {
    if (!period) return null
    const parsed = DateTime.fromISO(`${period}-01`)
    if (!parsed.isValid) return null
    return parsed.year * 12 + parsed.month
  }

  /**
   * Sinal do razão a partir do kind (§1.2): `withdrawal → −abs`, `deposit`/`opening` →
   * `+abs`. `adjustment` tem sinal LIVRE e conserva o que já estava gravado — o
   * validator do `PATCH` só aceita valores positivos e não teria como expressar um
   * ajuste negativo de outra forma.
   *
   * @param kind         kind FINAL do movimento
   * @param cents        magnitude em CENTAVOS (o sinal de entrada é ignorado)
   * @param currentCents CENTAVOS assinados já gravados; só usado em `adjustment`
   */
  #signedCents(kind: MovementKind, cents: number, currentCents = 0): number {
    const magnitude = Math.abs(cents)
    if (kind === 'withdrawal') return -magnitude
    if (kind === 'adjustment') return currentCents < 0 ? -magnitude : magnitude
    return magnitude
  }

  /**
   * CENTAVOS inteiros → reais como NÚMERO, via `fromCents` (a mesma travessia de
   * fronteira do resto do módulo) — campos agregados saem número, nunca string (§1.3).
   */
  #reais(cents: number): number {
    return Number(fromCents(cents))
  }

  /**
   * Normaliza o `occurred_on` de uma query CRUA (`db.from`) para `'YYYY-MM-DD'`.
   * O driver devolve `Date` nas colunas `date`; quando devolve string, ela já vem no
   * formato do MySQL e é apenas fatiada — nunca reparseada com `new Date(string)` (§13).
   */
  #isoDate(value: Date | string): string {
    if (typeof value === 'string') return value.slice(0, 10)
    return DateTime.fromJSDate(value).toFormat(SQL_DATE)
  }
}
