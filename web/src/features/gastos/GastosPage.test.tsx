import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { CategorySummary } from './CategorySummary'
import { DayGroup } from './DayGroup'
import { ExpenseRow } from './ExpenseRow'
import type { VariableExpense } from './useVariableExpenses'

/**
 * `categoryId` é NÚMERO de propósito: é o que a API entrega em runtime.
 * A fixture antiga usava string e escondeu dois bugs de coerção.
 */
function gasto(
  id: string,
  spentOn: string,
  amount: string,
  description: string | null = null,
  categoryId: number | null = null,
): VariableExpense {
  return { id, spentOn, amount, description, categoryId }
}

describe('CategorySummary', () => {
  it('lista as categorias com o total formatado', () => {
    render(
      <CategorySummary
        byCategory={[
          { categoryId: 1, name: 'Alimentação', color: '#ef4444', total: 210.4 },
          { categoryId: 2, name: 'Transporte', color: '#3b82f6', total: 143.2 },
        ]}
      />,
    )
    expect(screen.getByText('Alimentação')).toBeInTheDocument()
    expect(screen.getByText('R$ 210,40')).toBeInTheDocument()
    expect(screen.getByText('Transporte')).toBeInTheDocument()
    expect(screen.getByText('R$ 143,20')).toBeInTheDocument()
  })

  it('chama de "Sem categoria" o balde sem categoria', () => {
    render(
      <CategorySummary byCategory={[{ categoryId: null, name: null, color: null, total: 134 }]} />,
    )
    expect(screen.getByText('Sem categoria')).toBeInTheDocument()
  })

  it('não renderiza nada quando a lista está vazia', () => {
    const { container } = render(<CategorySummary byCategory={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('DayGroup', () => {
  const hoje = new Date(2026, 7, 4)

  it('mostra o rótulo do dia, o total e cada gasto', () => {
    render(
      <DayGroup
        group={{
          date: '2026-08-04',
          total: 51.4,
          expenses: [
            gasto('1', '2026-08-04', '32.50', 'Almoço'),
            gasto('2', '2026-08-04', '18.90', 'Uber'),
          ],
        }}
        today={hoje}
        categoryById={new Map()}
        onSelect={() => {}}
      />,
    )
    expect(screen.getByText('Hoje, 04/08')).toBeInTheDocument()
    expect(screen.getByText('R$ 51,40')).toBeInTheDocument()
    expect(screen.getByText('Almoço')).toBeInTheDocument()
    expect(screen.getByText('R$ 32,50')).toBeInTheDocument()
    expect(screen.getByText('Uber')).toBeInTheDocument()
  })

  it('usa um texto neutro quando o gasto não tem descrição', () => {
    render(
      <DayGroup
        group={{ date: '2026-08-04', total: 32.5, expenses: [gasto('1', '2026-08-04', '32.50')] }}
        today={hoje}
        categoryById={new Map()}
        onSelect={() => {}}
      />,
    )
    expect(screen.getByText('Gasto sem descrição')).toBeInTheDocument()
  })
})

describe('ExpenseRow', () => {
  it('acha a categoria mesmo com categoryId numérico vindo da API', () => {
    // O Map é indexado por String(id); a API manda number. Sem o String() na
    // consulta, Map.get(7) devolve undefined e o badge nunca renderiza.
    const categoryById = new Map([['7', { name: 'Alimentação', color: '#ef4444' }]])
    render(
      <ExpenseRow
        expense={gasto('1', '2026-08-04', '32.50', 'Almoço', 7)}
        categoryById={categoryById}
        onSelect={() => {}}
      />,
    )
    expect(screen.getByText('Alimentação')).toBeInTheDocument()
  })

  it('não quebra quando a categoria do gasto não está na lista carregada', () => {
    render(
      <ExpenseRow
        expense={gasto('1', '2026-08-04', '32.50', 'Almoço', 999)}
        categoryById={new Map()}
        onSelect={() => {}}
      />,
    )
    expect(screen.getByText('Almoço')).toBeInTheDocument()
  })

  it('devolve o gasto inteiro ao ser clicada', () => {
    const onSelect = vi.fn()
    const expense = gasto('1', '2026-08-04', '32.50', 'Almoço')
    render(<ExpenseRow expense={expense} categoryById={new Map()} onSelect={onSelect} />)

    screen.getByRole('button').click()

    expect(onSelect).toHaveBeenCalledWith(expense)
  })
})
