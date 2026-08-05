import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ResumoPanel } from './ResumoPanel'
import type { DashboardData } from '../useDashboard'

const sample: DashboardData = {
  totalDoMes: 4200,
  gastosVariaveis: 0,
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

  it('mostra os gastos avulsos, senão eles somem entre o total e as contas', () => {
    // total 2800 = 0 pago + 2000 a pagar + 800 de gasto avulso. Sem esta linha o
    // usuário vê R$ 2.800,00 no topo e só R$ 2.000,00 explicados abaixo.
    render(
      <ResumoPanel
        data={{ ...sample, totalDoMes: 2800, gastosVariaveis: 800, jaPago: 0, faltaPagar: 2000, percentualPago: 0 }}
        isLoading={false}
      />,
    )
    expect(screen.getByText('Gastos avulsos')).toBeInTheDocument()
    expect(screen.getByText('R$ 800,00')).toBeInTheDocument()
  })

  it('esconde a linha de gastos avulsos quando não houve nenhum', () => {
    render(<ResumoPanel data={sample} isLoading={false} />)
    expect(screen.queryByText('Gastos avulsos')).not.toBeInTheDocument()
  })

  it('mostra skeleton enquanto carrega', () => {
    const { container } = render(<ResumoPanel data={undefined} isLoading />)
    expect(container.querySelector('.animate-pulse')).toBeTruthy()
  })
})
