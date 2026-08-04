import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LockedAmount } from './LockedAmount'

describe('LockedAmount', () => {
  it('mostra o valor formatado e não renderiza input', () => {
    const { container } = render(<LockedAmount amount="487.60" />)
    expect(screen.getByText('R$ 487,60')).toBeInTheDocument()
    // O ponto da feature: aqui não se digita.
    expect(container.querySelector('input')).toBeNull()
  })

  it('mostra traço quando ainda não há lançamento no mês', () => {
    render(<LockedAmount amount={null} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('explica de onde vem o valor', () => {
    render(<LockedAmount amount="487.60" />)
    expect(screen.getByTitle('Calculado pela aba Gastos')).toBeInTheDocument()
  })
})
