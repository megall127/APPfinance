import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { GoalProgressBar } from './GoalProgressBar'

describe('GoalProgressBar', () => {
  it('converte a fração 0..1 em percentual inteiro', () => {
    render(<GoalProgressBar progresso={0.4288} metaTotal={30000} />)
    // 0.4288 → 43%, nunca 0% (esquecer o × 100 já mordeu no ResumoPanel)
    expect(screen.getByText('43%')).toBeInTheDocument()
    expect(screen.getByText('Meta de R$ 30.000,00')).toBeInTheDocument()
  })

  it('mostra o quanto falta e a previsão em meses', () => {
    render(
      <GoalProgressBar progresso={0.4288} faltam={17135.72} etaMeses={11} />,
    )
    expect(
      screen.getByText('Faltam R$ 17.135,72 · chega na meta em 11 meses'),
    ).toBeInTheDocument()
  })

  it('usa singular quando falta 1 mês', () => {
    render(<GoalProgressBar progresso={0.9} etaMeses={1} />)
    expect(screen.getByText('chega na meta em 1 mês')).toBeInTheDocument()
  })

  it('anuncia "Meta atingida" a partir de 100%', () => {
    render(<GoalProgressBar progresso={1} metaTotal={30000} />)
    expect(screen.getByText('100%')).toBeInTheDocument()
    expect(screen.getByText('Meta atingida')).toBeInTheDocument()
  })

  it('não estoura de 100% quando o saldo passa da meta', () => {
    render(<GoalProgressBar progresso={1.4} />)
    // O rótulo mostra o progresso real; a barra é que satura em 100.
    expect(screen.getByText('140%')).toBeInTheDocument()
    expect(screen.getByText('Meta atingida')).toBeInTheDocument()
  })

  it('sem meta e sem previsão, explica em vez de mostrar vazio', () => {
    render(<GoalProgressBar progresso={null} />)
    expect(screen.getByText('0%')).toBeInTheDocument()
    expect(
      screen.getByText('Sem previsão de conclusão no ritmo atual'),
    ).toBeInTheDocument()
  })
})
