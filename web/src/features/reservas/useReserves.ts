import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'

/**
 * Camada de dados do módulo Reservas (§6 e §7.3 do spec).
 *
 * REGRA HÍBRIDA DE DINHEIRO NO JSON (§1.3) — repetida no docblock de cada campo:
 * - campo que vem DIRETO de uma coluna `decimal` → **STRING** ("12693.55");
 * - campo AGREGADO ou derivado em JS → **NÚMERO** (12693.55).
 *
 * Toda mutation invalida pelo prefixo raiz `['reserves']`: saldo e rendimento
 * são derivados, então qualquer escrita muda accounts + summary + statement +
 * movements + cdi. Sem optimistic update e sem toast aqui — quem chama
 * `mutateAsync` faz o try/catch e o toast em pt-BR.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type RateKind = 'monthly' | 'yearly' | 'cdi'

export type MovementKind =
  | 'opening'
  | 'deposit'
  | 'withdrawal'
  | 'adjustment'
  | 'yield'

/** De onde saiu o CDI anual do mês: linha exata, carry-forward ou constante padrão. */
export type CdiSource = 'exact' | 'carry' | 'default'

/** Motivos pelos quais a apuração pulou um mês (§5.4). */
export type YieldSkipReason =
  | 'base_zero'
  | 'zero_yield'
  | 'cdi_missing'
  | 'before_opening'

/** Vigência de taxa aplicada à conta (§3.2). */
export interface ReserveRate {
  kind: RateKind
  /** decimal(9,6) do banco → STRING PERCENTUAL, ex.: "102.000000" */
  value: string
  effectiveYear: number
  /** 1..12 */
  effectiveMonth: number
}

/** Conta ("caixinha") — §6.2. */
export interface ReserveAccount {
  id: string
  name: string
  institution: string | null
  color: string | null
  /** 'YYYY-MM-DD' */
  openedAt: string
  /** decimal(12,2) do banco → STRING, ex.: "30000.00" */
  goalAmount: string | null
  /** 'YYYY-MM-DD' */
  goalDate: string | null
  /** decimal(12,2) do banco → STRING, ex.: "1500.00" */
  goalMonthlyContribution: string | null
  sortOrder: number
  /** o driver serializa boolean como 0/1 */
  archived: boolean | number
  /** 'YYYY-MM' do último mês já apurado; null quando nunca apurou */
  lastClosedPeriod: string | null
  rate: ReserveRate
  /** PERCENTUAL anual do CDI usado (14.9) → NÚMERO; null quando rate.kind !== 'cdi' */
  cdiAnnual: number | null
  /** null quando rate.kind !== 'cdi' */
  cdiSource: CdiSource | null
  /** fração 0..1 (0.0118757178) → NÚMERO; null em 'cdi' sem CDI resolvível */
  taxaMensalEfetiva: number | null
  /** fração 0..1 (0.15219528) → NÚMERO; null em 'cdi' sem CDI resolvível */
  taxaAnualEquivalente: number | null
  /** já formatado pela API, ex.: "102% do CDI · ≈1,19% a.m." */
  rateLabel: string
  /** agregado em JS → NÚMERO */
  saldo: number
  /** agregado em JS → NÚMERO (movimento `opening`) */
  saldoInicial: number
  /** agregado em JS → NÚMERO */
  totalDepositado: number
  /** agregado em JS → NÚMERO (positivo) */
  totalSacado: number
  /** agregado em JS → NÚMERO (assinado; conta como rendimento) */
  totalAjustes: number
  /** agregado em JS → NÚMERO (Σ yield + Σ adjustment) */
  totalRendimento: number
  /** agregado em JS → NÚMERO — o que já rendeu no mês corrente (§5.6) */
  rendimentoParcialDoMes: number
  /** agregado em JS → NÚMERO — o que deve fechar o mês corrente (§5.6) */
  rendimentoPrevistoDoMes: number
  /** fração 0..1 (como percentualPago do dashboard); null sem meta */
  metaProgresso: number | null
  /** agregado em JS → NÚMERO; null sem meta */
  metaFaltam: number | null
  /** meses até a meta; null sem meta ou meta inalcançável */
  metaEtaMeses: number | null
}

/** Uma conta dentro do consolidado — §6.1 `porConta`. */
export interface ReserveSummaryAccount {
  accountId: string
  name: string
  color: string | null
  /** agregado em JS → NÚMERO */
  saldo: number
  /** agregado em JS → NÚMERO */
  rendimentoParcialDoMes: number
  /** fração 0..1; null sem meta */
  metaProgresso: number | null
}

/** Um mês da evolução — §6.1 `evolucao12m`. */
export interface ReserveEvolutionPoint {
  year: number
  /** 1..12 */
  month: number
  /** agregado em JS → NÚMERO */
  saldoFinal: number
  /** agregado em JS → NÚMERO */
  rendimento: number
  /** agregado em JS → NÚMERO */
  aportes: number
  /** agregado em JS → NÚMERO (positivo) */
  saques: number
}

/** Ano/mês de um período de apuração. */
export interface ReservePeriod {
  year: number
  /** 1..12 */
  month: number
}

/**
 * Estado da apuração — §6.1 `apuracao`. Derivado de `last_closed_period`,
 * portanto converge mesmo quando o mês foi processado e nada foi criado.
 * Quando tudo está em dia vem apenas `{ pendente: false }`.
 */
export interface ReserveApuracao {
  pendente: boolean
  de?: ReservePeriod
  ate?: ReservePeriod
  /** quantas contas têm mês pendente */
  contas?: number
}

/** Consolidado do workspace — §6.1. Tudo agregado em JS → NÚMEROS. */
export interface ReserveSummary {
  year: number
  /** 1..12 */
  month: number
  /** agregado em JS → NÚMERO */
  totalGuardado: number
  /** agregado em JS → NÚMERO */
  totalPrincipal: number
  /** agregado em JS → NÚMERO */
  totalRendimento: number
  /** agregado em JS → NÚMERO (§5.6, rotular como "parcial") */
  rendimentoParcialDoMes: number
  /** agregado em JS → NÚMERO (§5.6) */
  rendimentoPrevistoDoMes: number
  /** agregado em JS → NÚMERO */
  rendimentoDoMesAnterior: number
  /** agregado em JS → NÚMERO */
  rendimentoNoAno: number
  contasAtivas: number
  /** agregado em JS → NÚMERO; null quando nenhuma conta tem meta */
  metaTotal: number | null
  /** fração 0..1 (como percentualPago do dashboard); null sem meta */
  metaProgresso: number | null
  porConta: ReserveSummaryAccount[]
  evolucao12m: ReserveEvolutionPoint[]
  apuracao: ReserveApuracao
}

/** Memória de cálculo congelada na linha de `yield` — §6.6. Tudo coluna decimal → STRING. */
export interface MovementYieldDetail {
  /** 'YYYY-MM' de competência */
  period: string
  /** decimal(14,6) do banco → STRING, ex.: "12285.056667" */
  base: string
  rateKind: RateKind
  /** decimal(9,6) do banco → STRING PERCENTUAL, ex.: "102.000000" */
  rateSource: string
  /** decimal(12,10) do banco → STRING em FRAÇÃO, ex.: "0.0118757178" */
  rateApplied: string
  /** decimal(9,6) do banco → STRING PERCENTUAL anual; null quando rateKind !== 'cdi' */
  cdiAnnual: string | null
  /** null quando rateKind !== 'cdi' */
  cdiSource: CdiSource | null
}

/** Linha do extrato — §6.6. */
export interface StatementMovement {
  id: string
  kind: MovementKind
  /** 'YYYY-MM-DD' */
  occurredOn: string
  /** decimal(12,2) do banco → STRING ASSINADA, ex.: "-2000.00" */
  amount: string
  /** derivado em JS → NÚMERO assinado (a UI não recalcula) */
  signedAmount: number
  description: string | null
  /** saldo corrente após a linha, derivado em JS → NÚMERO */
  saldoApos: number
  /** false para `yield`: rendimento só muda reexecutando a apuração */
  editavel: boolean
  /** preenchido apenas quando kind === 'yield' */
  yield: MovementYieldDetail | null
}

/** Extrato de uma conta — §6.6. */
export interface StatementResponse {
  accountId: string
  /** 'YYYY-MM-DD' */
  from: string
  /** 'YYYY-MM-DD' */
  to: string
  /** agregado em JS → NÚMERO */
  saldoInicial: number
  /** agregado em JS → NÚMERO */
  saldoFinal: number
  movements: StatementMovement[]
}

/**
 * Movimentação da lista plana — §6.8 (`accountName`/`accountColor` embutidos).
 * Os dois campos da conta não voltam nas respostas de escrita (§6.9/§6.10).
 */
export interface Movement {
  id: string
  accountId: string
  accountName?: string
  accountColor?: string | null
  kind: MovementKind
  /** 'YYYY-MM-DD' */
  occurredOn: string
  /** decimal(12,2) do banco → STRING ASSINADA, ex.: "-200.00" */
  amount: string
  /** derivado em JS → NÚMERO assinado */
  signedAmount: number
  description: string | null
}

/** Resposta de POST/PATCH de movimentação — §6.9 / §6.10. */
export interface MovementMutationResponse extends Movement {
  /** agregado em JS → NÚMERO */
  saldoDaConta: number
  saldoNegativo: boolean
  /** true quando `occurredOn` cai em mês <= last_closed_period */
  recalcularSugerido: boolean
}

/** Resposta de DELETE de movimentação — §6.10. */
export interface DeleteMovementResponse {
  deleted: boolean
  /** agregado em JS → NÚMERO */
  saldoDaConta: number
  recalcularSugerido: boolean
}

/** CDI vigente hoje — §6.12. */
export interface CdiCurrent {
  /** derivado em JS → NÚMERO PERCENTUAL anual, ex.: 14.9 */
  annualRate: number
  source: CdiSource
  /** null quando veio da constante padrão */
  year: number | null
  /** 1..12; null quando veio da constante padrão */
  month: number | null
  /** fração 0..1 → NÚMERO, ex.: 0.011641575 */
  mensalEquivalente: number
}

/** Linha do histórico de CDI — §6.12. */
export interface CdiHistoryEntry {
  id: string
  year: number
  /** 1..12 — mês a partir do qual a taxa vale */
  month: number
  /** decimal(9,6) do banco → STRING PERCENTUAL anual, ex.: "14.900000" */
  annualRate: string
}

/** GET /reserves/cdi — §6.12. */
export interface CdiResponse {
  vigenteHoje: CdiCurrent
  historico: CdiHistoryEntry[]
}

/** Uma conta apurada com sucesso — §6.11 `details`. */
export interface CloseYieldDetail {
  accountId: string
  accountName: string
  /** 'YYYY-MM' */
  period: string
  /** decimal(12,2) do banco → STRING; null quando a linha nasceu agora */
  amountBefore: string | null
  /** decimal(12,2) do banco → STRING, ex.: "145.89" */
  amountAfter: string
  /** decimal(14,6) do banco → STRING, ex.: "12285.056667" */
  base: string
  /** decimal(12,10) do banco → STRING em FRAÇÃO, ex.: "0.0118757178" */
  rateApplied: string
  /** null quando a taxa da conta não é '% do CDI' */
  cdiSource: CdiSource | null
}

/** Uma conta/mês pulado — §6.11 `skipped`. É RENDERIZADO na UI, não só logado. */
export interface CloseYieldSkip {
  accountId: string
  accountName: string
  /** 'YYYY-MM' */
  period: string
  reason: YieldSkipReason
}

/** POST /reserves/yield/close — §6.11. */
export interface CloseYieldResponse {
  /** 'YYYY-MM' do último mês apurado nesta chamada */
  throughPeriod: string
  processed: number
  created: number
  updated: number
  unchanged: number
  /** agregado em JS → NÚMERO */
  totalCreditado: number
  details: CloseYieldDetail[]
  skipped: CloseYieldSkip[]
}

/** POST /reserves/accounts/:id/reconcile — §6.7. */
export interface ReconcileResponse {
  adjusted: boolean
  /** agregado em JS → NÚMERO assinado; 0 quando nada foi gravado */
  delta: number
  /** null quando delta === 0 */
  movementId: string | null
  /** agregado em JS → NÚMERO */
  saldoAnterior: number
  /** agregado em JS → NÚMERO */
  saldoAtual: number
  recalcularSugerido: boolean
}

// ── Payloads ──────────────────────────────────────────────────────────────────

/**
 * §6.3. Dinheiro entra como NÚMERO em todo o módulo (convenção de `entries`,
 * não a regex-string de `items`). `rateValue` é PERCENTUAL: 0.85 | 12.5 | 102.
 */
export interface CreateReserveAccountPayload {
  name: string
  institution?: string
  /** '#RRGGBB' */
  color?: string
  /** 'YYYY-MM-DD' — imutável depois de criada */
  openedAt: string
  rateKind: RateKind
  /** PERCENTUAL 0..1000 (110% do CDI é válido) */
  rateValue: number
  /** NÚMERO em reais — vira o movimento kind='opening' */
  saldoInicial?: number
  /** NÚMERO em reais */
  goalAmount?: number
  /** 'YYYY-MM-DD' */
  goalDate?: string
  /** NÚMERO em reais */
  goalMonthlyContribution?: number
  sortOrder?: number
}

/** §6.4 — mesmo conjunto de §6.3 menos `openedAt`, que é imutável. */
/**
 * §6.4 — tudo opcional, sem `openedAt` (imutável).
 *
 * Nos campos apagáveis, `null` significa APAGAR e ausente significa "não mexe":
 * `undefined` some do corpo JSON, então sem o `null` explícito não haveria como
 * remover uma meta já cadastrada.
 */
export type UpdateReserveAccountPayload = Partial<
  Omit<
    CreateReserveAccountPayload,
    'openedAt' | 'institution' | 'goalAmount' | 'goalDate' | 'goalMonthlyContribution'
  >
> & {
  institution?: string | null
  goalAmount?: number | null
  goalDate?: string | null
  goalMonthlyContribution?: number | null
}

/** §6.4 — conta + aviso quando a mudança afeta meses já apurados. */
export interface UpdateReserveAccountResponse extends ReserveAccount {
  recalcularSugerido?: boolean
}

/** §6.5 — as duas chaves sempre, como `items`/`categories`. */
export interface DeleteReserveAccountResponse {
  archived: boolean
  deleted: boolean
}

/** §6.9 — só `deposit`/`withdrawal`; o valor vai POSITIVO e o service assina. */
export interface CreateMovementPayload {
  accountId: string
  kind: 'deposit' | 'withdrawal'
  /** 'YYYY-MM-DD' */
  occurredOn: string
  /** NÚMERO em reais, POSITIVO (mínimo 0.01) */
  amount: number
  description?: string
}

/** §6.10 — tudo opcional, menos `accountId`, que é imutável. */
export type UpdateMovementPayload = Partial<
  Omit<CreateMovementPayload, 'accountId'>
>

/** §6.7 — "quanto tem hoje na caixinha, segundo o banco?". */
export interface ReconcilePayload {
  /** NÚMERO em reais — saldo REAL do extrato do banco */
  balance: number
  /** 'YYYY-MM-DD'; default: hoje */
  occurredOn?: string
  description?: string
}

/** §6.11 — sem nada: mês anterior, todas as contas. */
export interface CloseYieldPayload {
  year?: number
  /** 1..12 */
  month?: number
  accountId?: string
}

/** §6.12 — `annualRate` é PERCENTUAL ANUAL (14.9 = 14,90% a.a.). */
export interface UpsertCdiPayload {
  year: number
  /** 1..12 */
  month: number
  /** NÚMERO PERCENTUAL anual 0..100 */
  annualRate: number
}

/** §6.12 — PUT /reserves/cdi. */
export interface UpsertCdiResponse {
  id: string
  year: number
  month: number
  /** decimal(9,6) do banco → STRING PERCENTUAL anual, ex.: "15.000000" */
  annualRate: string
  contasEmCdi: number
  recalcularSugerido: boolean
}

/** Filtros de §6.8. Só `accountId` e `kind` entram na query key. */
export interface MovementsFilters {
  accountId?: string
  kind?: MovementKind
  /** 'YYYY-MM-DD' */
  from?: string
  /** 'YYYY-MM-DD' */
  to?: string
  /** 1..500; default 50 na API */
  limit?: number
}

// ── Keys ──────────────────────────────────────────────────────────────────────

export const RESERVES_KEY = ['reserves'] as const

export const reserveAccountsKey = (includeArchived = false) =>
  ['reserves', 'accounts', includeArchived] as const

export const reserveSummaryKey = (year: number, month: number) =>
  ['reserves', 'summary', year, month] as const

export const reserveStatementKey = (id: string, year?: number, month?: number) =>
  ['reserves', 'statement', id, year ?? 'all', month ?? 'all'] as const

/**
 * TODO filtro que muda o RESULTADO precisa estar na key: com a mesma key, o React
 * Query devolve o cache e não refaz a requisição, por mais que as opções mudem —
 * era o que deixava o botão "Carregar mais" sem efeito.
 */
export const reserveMovementsKey = (
  accountId?: string,
  kind?: string,
  limit?: number,
  from?: string,
  to?: string,
) =>
  [
    'reserves',
    'movements',
    accountId ?? 'all',
    kind ?? 'all',
    limit ?? 'default',
    from ?? 'all',
    to ?? 'all',
  ] as const

export const cdiKey = (year?: number) => ['reserves', 'cdi', year ?? 'all'] as const

// ── useReserveAccounts ────────────────────────────────────────────────────────

export function useReserveAccounts(includeArchived = false) {
  return useQuery<ReserveAccount[]>({
    queryKey: reserveAccountsKey(includeArchived),
    queryFn: async () => {
      const { data } = await api.get<ReserveAccount[]>('/reserves/accounts', {
        params: includeArchived ? { includeArchived: true } : undefined,
      })
      return data
    },
  })
}

// ── useReserveSummary ─────────────────────────────────────────────────────────

/** `month` é 1-based (1..12) e vai direto para a API, como no dashboard. */
export function useReserveSummary(year: number, month: number) {
  return useQuery<ReserveSummary>({
    queryKey: reserveSummaryKey(year, month),
    queryFn: async () => {
      const { data } = await api.get<ReserveSummary>('/reserves/summary', {
        params: { year, month },
      })
      return data
    },
  })
}

// ── useReserveStatement ───────────────────────────────────────────────────────

/**
 * Extrato de uma conta. Sem `year`/`month` a API devolve os últimos 12 meses.
 * `id` nulo desabilita a query (o diálogo só busca quando está aberto).
 */
export function useReserveStatement(
  id: string | null,
  year?: number,
  month?: number,
) {
  return useQuery<StatementResponse>({
    queryKey: reserveStatementKey(id ?? 'none', year, month),
    enabled: Boolean(id),
    queryFn: async () => {
      const { data } = await api.get<StatementResponse>(
        `/reserves/accounts/${id}/statement`,
        { params: { year, month } },
      )
      return data
    },
  })
}

// ── useReserveMovements ───────────────────────────────────────────────────────

export function useReserveMovements(filters: MovementsFilters = {}) {
  const { accountId, kind, from, to, limit } = filters
  return useQuery<Movement[]>({
    queryKey: reserveMovementsKey(accountId, kind, limit, from, to),
    queryFn: async () => {
      const { data } = await api.get<Movement[]>('/reserves/movements', {
        params: { accountId, kind, from, to, limit },
      })
      return data
    },
    // Aumentar o limite cria uma key nova, e sem isto a lista inteira sumiria
    // atrás do skeleton a cada "Carregar mais" (a tela pisca e a rolagem se perde).
    placeholderData: (anterior) => anterior,
  })
}

// ── useCdi ────────────────────────────────────────────────────────────────────

export function useCdi(year?: number) {
  return useQuery<CdiResponse>({
    queryKey: cdiKey(year),
    queryFn: async () => {
      const { data } = await api.get<CdiResponse>('/reserves/cdi', {
        params: year ? { year } : undefined,
      })
      return data
    },
  })
}

// ── useCreateReserveAccount ───────────────────────────────────────────────────

export function useCreateReserveAccount() {
  const qc = useQueryClient()
  return useMutation<ReserveAccount, Error, CreateReserveAccountPayload>({
    mutationFn: async (payload) => {
      const { data } = await api.post<ReserveAccount>(
        '/reserves/accounts',
        payload,
      )
      return data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['reserves'] })
    },
  })
}

// ── useUpdateReserveAccount ───────────────────────────────────────────────────

export interface UpdateReserveAccountVars {
  id: string
  payload: UpdateReserveAccountPayload
}

export function useUpdateReserveAccount() {
  const qc = useQueryClient()
  return useMutation<
    UpdateReserveAccountResponse,
    Error,
    UpdateReserveAccountVars
  >({
    mutationFn: async ({ id, payload }) => {
      const { data } = await api.patch<UpdateReserveAccountResponse>(
        `/reserves/accounts/${id}`,
        payload,
      )
      return data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['reserves'] })
    },
  })
}

// ── useDeleteReserveAccount ───────────────────────────────────────────────────

export function useDeleteReserveAccount() {
  const qc = useQueryClient()
  return useMutation<DeleteReserveAccountResponse, Error, string>({
    mutationFn: async (id) => {
      const { data } = await api.delete<DeleteReserveAccountResponse>(
        `/reserves/accounts/${id}`,
      )
      return data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['reserves'] })
    },
  })
}

// ── useCreateMovement ─────────────────────────────────────────────────────────

export function useCreateMovement() {
  const qc = useQueryClient()
  return useMutation<MovementMutationResponse, Error, CreateMovementPayload>({
    mutationFn: async (payload) => {
      const { data } = await api.post<MovementMutationResponse>(
        '/reserves/movements',
        payload,
      )
      return data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['reserves'] })
    },
  })
}

// ── useUpdateMovement ─────────────────────────────────────────────────────────

export interface UpdateMovementVars {
  id: string
  payload: UpdateMovementPayload
}

export function useUpdateMovement() {
  const qc = useQueryClient()
  return useMutation<MovementMutationResponse, Error, UpdateMovementVars>({
    mutationFn: async ({ id, payload }) => {
      const { data } = await api.patch<MovementMutationResponse>(
        `/reserves/movements/${id}`,
        payload,
      )
      return data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['reserves'] })
    },
  })
}

// ── useDeleteMovement ─────────────────────────────────────────────────────────

export function useDeleteMovement() {
  const qc = useQueryClient()
  return useMutation<DeleteMovementResponse, Error, string>({
    mutationFn: async (id) => {
      const { data } = await api.delete<DeleteMovementResponse>(
        `/reserves/movements/${id}`,
      )
      return data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['reserves'] })
    },
  })
}

// ── useReconcileAccount ───────────────────────────────────────────────────────

export interface ReconcileVars {
  id: string
  payload: ReconcilePayload
}

export function useReconcileAccount() {
  const qc = useQueryClient()
  return useMutation<ReconcileResponse, Error, ReconcileVars>({
    mutationFn: async ({ id, payload }) => {
      const { data } = await api.post<ReconcileResponse>(
        `/reserves/accounts/${id}/reconcile`,
        payload,
      )
      return data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['reserves'] })
    },
  })
}

// ── useCloseYield ─────────────────────────────────────────────────────────────

/**
 * Apuração de rendimento. Idempotente: pode ser chamada sem argumento
 * (`mutate()`) para fechar até o mês anterior em todas as contas.
 */
export function useCloseYield() {
  const qc = useQueryClient()
  return useMutation<CloseYieldResponse, Error, CloseYieldPayload | void>({
    mutationFn: async (payload) => {
      const { data } = await api.post<CloseYieldResponse>(
        '/reserves/yield/close',
        payload ?? {},
      )
      return data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['reserves'] })
    },
  })
}

// ── useUpsertCdi ──────────────────────────────────────────────────────────────

export function useUpsertCdi() {
  const qc = useQueryClient()
  return useMutation<UpsertCdiResponse, Error, UpsertCdiPayload>({
    mutationFn: async (payload) => {
      const { data } = await api.put<UpsertCdiResponse>(
        '/reserves/cdi',
        payload,
      )
      return data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['reserves'] })
    },
  })
}
