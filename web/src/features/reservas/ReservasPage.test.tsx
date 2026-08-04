import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import type { ReserveAccount, ReserveSummary } from './useReserves'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const summary = {
  year: 2026,
  month: 7,
  totalGuardado: 12864.28,
  totalPrincipal: 12500,
  totalRendimento: 364.28,
  rendimentoParcialDoMes: 101.19,
  rendimentoPrevistoDoMes: 150.47,
  rendimentoDoMesAnterior: 145.89,
  rendimentoNoAno: 364.28,
  contasAtivas: 1,
  metaTotal: 30000,
  metaProgresso: 0.4288,
  porConta: [],
  evolucao12m: [],
  apuracao: { pendente: false },
} as unknown as ReserveSummary

const conta = {
  id: '1',
  name: 'Reserva de emergência',
  institution: 'Nubank',
  color: '#4CAF82',
  openedAt: '2026-04-10',
  goalAmount: '30000.00',
  goalDate: null,
  goalMonthlyContribution: '1500.00',
  sortOrder: 0,
  archived: false,
  lastClosedPeriod: '2026-06',
  rate: { kind: 'cdi', value: '102.000000', effectiveYear: 2026, effectiveMonth: 4 },
  cdiAnnual: 14.9,
  cdiSource: 'default',
  taxaMensalEfetiva: 0.0118757178,
  taxaAnualEquivalente: 0.15219528,
  rateLabel: '102% do CDI · ≈1,19% a.m.',
  saldo: 12864.28,
  saldoInicial: 10000,
  totalDepositado: 3000,
  totalSacado: 2000,
  totalAjustes: 0,
  totalRendimento: 364.28,
  rendimentoParcialDoMes: 101.19,
  rendimentoPrevistoDoMes: 150.47,
  metaProgresso: 0.4288,
  metaFaltam: 17135.72,
  metaEtaMeses: 11,
} as unknown as ReserveAccount

// ── Estado controlável pelos testes ───────────────────────────────────────────

// `vi.mock` é içado para o topo do arquivo, então a fábrica não enxerga
// variáveis de módulo comuns — `vi.hoisted` sobe estas junto.
const { state, query, mutation } = vi.hoisted(() => ({
  state: {
    summary: undefined as unknown,
    accounts: undefined as unknown,
    accountsLoading: false,
  },
  query: (data: unknown) => ({ data, isLoading: false, isError: false }),
  mutation: () => ({
    mutate: () => {},
    mutateAsync: () => Promise.resolve({}),
    isPending: false,
  }),
}))

// Mocka a camada de dados inteira: sem rede e sem QueryClientProvider, como
// nos demais testes de página do repo.
vi.mock('./useReserves', () => ({
  useReserveSummary: () => query(state.summary),
  useReserveAccounts: () => ({
    data: state.accounts,
    isLoading: state.accountsLoading,
    isError: false,
  }),
  useReserveStatement: () => query(undefined),
  useReserveMovements: () => query([]),
  useCdi: () => query({ vigenteHoje: { annualRate: 14.9, source: 'default' } }),
  useCreateReserveAccount: mutation,
  useUpdateReserveAccount: mutation,
  useDeleteReserveAccount: mutation,
  useCreateMovement: mutation,
  useUpdateMovement: mutation,
  useDeleteMovement: mutation,
  useReconcileAccount: mutation,
  useCloseYield: mutation,
  useUpsertCdi: mutation,
}))

import ReservasPage from './ReservasPage'

describe('ReservasPage', () => {
  it('mostra o total consolidado e uma linha por caixinha', () => {
    state.summary = summary
    state.accounts = [conta]
    state.accountsLoading = false

    render(<ReservasPage />)

    expect(screen.getByText('Reservas')).toBeInTheDocument()
    // O total aparece no cabeçalho consolidado E no card da única caixinha.
    expect(screen.getAllByText('R$ 12.864,28').length).toBeGreaterThan(0)
    expect(screen.getByText('Reserva de emergência')).toBeInTheDocument()
  })

  it('mostra o banner quando há rendimento pendente', () => {
    state.summary = {
      ...summary,
      apuracao: {
        pendente: true,
        de: { year: 2026, month: 3 },
        ate: { year: 2026, month: 6 },
        contas: 1,
      },
    } as unknown as ReserveSummary

    render(<ReservasPage />)

    expect(
      screen.getByText('Seus rendimentos estão desatualizados desde março'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Atualizar rendimentos' }),
    ).toBeInTheDocument()
    // Linguagem de família — nunca "apurar"/"vigência"/"reapuração" (§13).
    expect(document.body.textContent).not.toMatch(/apurar|vigência|apuração/i)
  })

  it('sem caixinhas, convida a criar a primeira', () => {
    state.summary = { ...summary, contasAtivas: 0 } as ReserveSummary
    state.accounts = []
    state.accountsLoading = false

    render(<ReservasPage />)

    expect(screen.getByText('Nenhuma caixinha ainda.')).toBeInTheDocument()
    expect(screen.getByText('Criar a primeira')).toBeInTheDocument()
  })

  it('mostra skeleton enquanto as caixinhas carregam', () => {
    state.accounts = undefined
    state.accountsLoading = true

    const { container } = render(<ReservasPage />)

    expect(container.querySelector('.animate-pulse')).not.toBeNull()
  })
})
