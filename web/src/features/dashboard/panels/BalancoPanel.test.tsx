import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { BalancoPanel } from './BalancoPanel'
import type { DashboardData } from '../useDashboard'

const base: DashboardData = {
  totalDoMes: 4200,
  jaPago: 3100,
  faltaPagar: 1100,
  percentualPago: 0.74,
  receitas: 5300,
  saldo: 1100,
  assinaturasCartao: 320,
  breakdownPorCategoria: [],
}

describe('BalancoPanel', () => {
  it('mostra receitas, saldo e assinaturas', () => {
    render(<BalancoPanel data={base} isLoading={false} />)
    expect(screen.getByText('R$ 5.300,00')).toBeInTheDocument()
    expect(screen.getByText('R$ 1.100,00')).toBeInTheDocument()
    expect(screen.getByText('R$ 320,00')).toBeInTheDocument()
  })

  it('saldo negativo aparece em vermelho (destructive)', () => {
    render(<BalancoPanel data={{ ...base, saldo: -200 }} isLoading={false} />)
    const saldo = screen.getByText('-R$ 200,00')
    expect(saldo.className).toContain('text-destructive')
  })
})
