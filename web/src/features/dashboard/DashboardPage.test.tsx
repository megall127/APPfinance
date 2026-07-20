import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

// Mocka os hooks de dados para evitar rede/React Query no teste.
vi.mock('./useDashboard', () => ({
  useDashboard: () => ({
    data: {
      totalDoMes: 4200,
      jaPago: 3100,
      faltaPagar: 1100,
      percentualPago: 0.74,
      receitas: 5300,
      saldo: 1100,
      assinaturasCartao: 320,
      breakdownPorCategoria: [],
    },
    isLoading: false,
    isError: false,
  }),
  useYearly: () => ({ data: { months: [] }, isLoading: false }),
}))

import DashboardPage from './DashboardPage'

describe('DashboardPage', () => {
  it('renderiza os 4 painéis do carrossel com os dados', () => {
    render(<DashboardPage />)
    expect(screen.getByText('R$ 4.200,00')).toBeInTheDocument() // Resumo
    expect(screen.getByText('R$ 5.300,00')).toBeInTheDocument() // Balanço (receitas)
    expect(screen.getAllByRole('tab')).toHaveLength(4) // 4 dots
  })
})
