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

// O GuardadoPanel consome React Query via useReserveSummary; sem este mock o
// teste morre com "No QueryClient set" (não há Provider aqui).
vi.mock('@/features/reservas/useReserves', () => ({
  useReserveSummary: () => ({
    data: {
      // Mês corrente: o painel rotula o rendimento como "parcial · até hoje"
      // só nesse caso, então a fixture acompanha o relógio.
      year: new Date().getFullYear(),
      month: new Date().getMonth() + 1,
      totalGuardado: 12864.28,
      rendimentoParcialDoMes: 101.19,
      rendimentoNoAno: 364.28,
      contasAtivas: 1,
      metaTotal: 30000,
      metaProgresso: 0.4288,
      evolucao12m: [],
    },
    isLoading: false,
    isError: false,
  }),
}))

import DashboardPage from './DashboardPage'

describe('DashboardPage', () => {
  it('renderiza os 5 painéis do carrossel com os dados', () => {
    render(<DashboardPage />)
    expect(screen.getByText('R$ 4.200,00')).toBeInTheDocument() // Resumo
    expect(screen.getByText('R$ 5.300,00')).toBeInTheDocument() // Balanço (receitas)
    expect(screen.getByText('R$ 12.864,28')).toBeInTheDocument() // Guardado
    expect(screen.getAllByRole('tab')).toHaveLength(5) // 5 dots
  })
})
