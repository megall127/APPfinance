import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'

// Mocka a camada de dados para evitar rede/React Query no teste.
// O CDI vigente é 14,9% a.a., o mesmo do vetor V2b de §5.9.
vi.mock('@/features/reservas/useReserves', () => ({
  useCdi: () => ({
    data: {
      vigenteHoje: {
        annualRate: 14.9,
        source: 'exact',
        year: 2026,
        month: 1,
        mensalEquivalente: 0.011641575,
      },
      historico: [],
    },
    isLoading: false,
  }),
  useCreateReserveAccount: () => ({ mutateAsync: vi.fn() }),
  useUpdateReserveAccount: () => ({ mutateAsync: vi.fn() }),
}))

import { ReserveAccountFormDialog } from './ReserveAccountFormDialog'
import type { RateKind, ReserveAccount } from './useReserves'

/** Caixinha mínima para abrir o diálogo em modo edição com uma taxa conhecida. */
function makeAccount(kind: RateKind, value: string): ReserveAccount {
  return {
    id: '1',
    name: 'Reserva de emergência',
    institution: 'Nubank',
    color: '#4CAF82',
    openedAt: '2026-01-01',
    goalAmount: null,
    goalDate: null,
    goalMonthlyContribution: null,
    rate: { kind, value, effectiveYear: 2026, effectiveMonth: 1 },
  } as ReserveAccount
}

describe('ReserveAccountFormDialog', () => {
  it('mostra o preview das três leituras para uma taxa em % ao ano', async () => {
    const user = userEvent.setup()
    render(
      <ReserveAccountFormDialog
        open
        onOpenChange={() => {}}
        account={makeAccount('yearly', '10.000000')}
      />,
    )

    const rateInput = screen.getByLabelText('Taxa *')
    await user.clear(rateInput)
    await user.type(rateInput, '12,5')

    expect(
      screen.getByText(
        'Equivale a ≈0,9864% ao mês · 12,5000% ao ano · em R$ 10.000 renderia R$ 98,64/mês',
      ),
    ).toBeInTheDocument()
  })

  it('mostra o preview de uma taxa em % do CDI usando o CDI vigente', async () => {
    const user = userEvent.setup()
    render(
      <ReserveAccountFormDialog
        open
        onOpenChange={() => {}}
        account={makeAccount('cdi', '100.000000')}
      />,
    )

    const rateInput = screen.getByLabelText('Taxa *')
    await user.clear(rateInput)
    await user.type(rateInput, '102')

    expect(
      screen.getByText(
        'Equivale a ≈1,1876% ao mês · 15,2195% ao ano · em R$ 10.000 renderia R$ 118,76/mês',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Na lista aparece como 102% do CDI · ≈1,19% a.m.'),
    ).toBeInTheDocument()
  })

  it('não mostra preview enquanto a taxa está vazia', async () => {
    const user = userEvent.setup()
    render(
      <ReserveAccountFormDialog
        open
        onOpenChange={() => {}}
        account={makeAccount('monthly', '0.850000')}
      />,
    )

    const rateInput = screen.getByLabelText('Taxa *')
    await user.clear(rateInput)

    expect(
      screen.getByText('Digite a taxa para ver quanto isso rende por mês.'),
    ).toBeInTheDocument()
  })
})
