import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ResumoPanel } from './ResumoPanel'
import type { DashboardData } from '../useDashboard'

const sample: DashboardData = {
  totalDoMes: 4200,
  jaPago: 3100,
  faltaPagar: 1100,
  percentualPago: 0.74,
  receitas: 5300,
  saldo: 1100,
  assinaturasCartao: 320,
  breakdownPorCategoria: [],
}

describe('ResumoPanel', () => {
  it('mostra total, pago, falta e % pago', () => {
    render(<ResumoPanel data={sample} isLoading={false} />)
    expect(screen.getByText('R$ 4.200,00')).toBeInTheDocument()
    expect(screen.getByText('R$ 3.100,00')).toBeInTheDocument()
    expect(screen.getByText('R$ 1.100,00')).toBeInTheDocument()
    expect(screen.getByText('74%')).toBeInTheDocument()
  })

  it('mostra skeleton enquanto carrega', () => {
    const { container } = render(<ResumoPanel data={undefined} isLoading />)
    expect(container.querySelector('.animate-pulse')).toBeTruthy()
  })
})
