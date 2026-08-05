import { describe, it, expect } from 'vitest'
import { groupByDay, dayLabel, defaultSpentOn } from './grouping'
import type { VariableExpense } from './useVariableExpenses'

function gasto(id: string, spentOn: string, amount: string): VariableExpense {
  return { id, spentOn, amount, description: null, categoryId: null }
}

describe('groupByDay', () => {
  it('agrupa por data com o dia mais recente primeiro', () => {
    const groups = groupByDay([
      gasto('1', '2026-08-03', '84.10'),
      gasto('2', '2026-08-04', '32.50'),
      gasto('3', '2026-08-04', '18.90'),
    ])

    expect(groups.map((g) => g.date)).toEqual(['2026-08-04', '2026-08-03'])
    expect(groups[0].expenses).toHaveLength(2)
    expect(groups[1].expenses).toHaveLength(1)
  })

  it('soma o total do dia em centavos, sem erro de float', () => {
    // 0.1 + 0.2 em float dá 0.30000000000000004 — não pode chegar na tela.
    const groups = groupByDay([
      gasto('1', '2026-08-04', '0.10'),
      gasto('2', '2026-08-04', '0.20'),
    ])
    expect(groups[0].total).toBe(0.3)
  })

  it('devolve lista vazia para entrada vazia', () => {
    expect(groupByDay([])).toEqual([])
  })

  it('separa dias de meses diferentes', () => {
    const groups = groupByDay([
      gasto('1', '2026-07-31', '10.00'),
      gasto('2', '2026-08-01', '20.00'),
    ])
    expect(groups.map((g) => g.date)).toEqual(['2026-08-01', '2026-07-31'])
  })

  it('preserva a ordem em que os gastos chegaram dentro do dia', () => {
    const groups = groupByDay([
      gasto('1', '2026-08-04', '10.00'),
      gasto('2', '2026-08-04', '20.00'),
    ])
    expect(groups[0].expenses.map((e) => e.id)).toEqual(['1', '2'])
  })
})

describe('dayLabel', () => {
  const hoje = new Date(2026, 7, 4) // 4 de agosto de 2026 (mês 0-indexado)

  it('rotula o dia de hoje', () => {
    expect(dayLabel('2026-08-04', hoje)).toBe('Hoje, 04/08')
  })

  it('rotula o dia de ontem', () => {
    expect(dayLabel('2026-08-03', hoje)).toBe('Ontem, 03/08')
  })

  it('usa o dia da semana para datas mais antigas', () => {
    // 02/08/2026 é um domingo
    expect(dayLabel('2026-08-02', hoje)).toBe('dom, 02/08')
  })

  it('atravessa a virada de mês corretamente', () => {
    const primeiroDeAgosto = new Date(2026, 7, 1)
    expect(dayLabel('2026-07-31', primeiroDeAgosto)).toBe('Ontem, 31/07')
  })

  it('atravessa a virada de ano corretamente', () => {
    const primeiroDeJaneiro = new Date(2027, 0, 1)
    expect(dayLabel('2026-12-31', primeiroDeJaneiro)).toBe('Ontem, 31/12')
  })

  it('não se confunde com horário de verão (diferença de 23h ou 25h)', () => {
    // A conta é feita entre duas meia-noites locais, então o arredondamento
    // absorve o dia de 23h/25h em vez de virar "2 dias atrás".
    const hojeNoDST = new Date(2026, 9, 19)
    expect(dayLabel('2026-10-18', hojeNoDST)).toBe('Ontem, 18/10')
  })
})

describe('defaultSpentOn', () => {
  const hoje = new Date(2026, 7, 5) // 5 de agosto de 2026

  it('usa a data de hoje quando o mês exibido é o mês corrente', () => {
    expect(defaultSpentOn(2026, 8, hoje)).toBe('2026-08-05')
  })

  it('usa o dia 1 quando o mês exibido é um mês passado', () => {
    // Sem isso o gasto lançado olhando julho ia parar em agosto.
    expect(defaultSpentOn(2026, 7, hoje)).toBe('2026-07-01')
  })

  it('usa o dia 1 quando o mês exibido é um mês futuro', () => {
    expect(defaultSpentOn(2026, 9, hoje)).toBe('2026-09-01')
  })

  it('não confunde o mesmo mês de outro ano', () => {
    expect(defaultSpentOn(2025, 8, hoje)).toBe('2025-08-01')
  })

  it('zero-padding no mês de um dígito', () => {
    expect(defaultSpentOn(2026, 3, hoje)).toBe('2026-03-01')
  })
})
