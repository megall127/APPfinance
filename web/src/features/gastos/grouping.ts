import type { VariableExpense } from './useVariableExpenses'

export interface DayGroup {
  /** 'YYYY-MM-DD' */
  date: string
  /** Soma dos gastos do dia, em reais. */
  total: number
  expenses: VariableExpense[]
}

const WEEKDAYS_PT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const

/**
 * Hoje em 'YYYY-MM-DD', montado com getFullYear/getMonth/getDate.
 * NUNCA `toISOString()`: ele converte para UTC e, em fuso negativo, devolve o
 * dia anterior depois das 21h — o gasto cairia no dia (e no mês) errado.
 */
export function todayISO(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

/**
 * Data que o formulário de gasto deve sugerir para o mês que está na tela.
 *
 * Hoje SÓ quando o mês exibido é o mês corrente; nos demais, o dia 1 daquele mês.
 * Sugerir `todayISO()` cego fazia o gasto lançado olhando julho ser gravado em
 * agosto: a linha piscava na lista de julho (update otimista) e sumia, e o total
 * de agosto no dashboard subia sozinho.
 *
 * `today` entra por parâmetro para o teste não depender do relógio.
 */
export function defaultSpentOn(year: number, month: number, today: Date): string {
  if (year === today.getFullYear() && month === today.getMonth() + 1) {
    return todayISO()
  }
  return `${year}-${String(month).padStart(2, '0')}-01`
}

/** 'YYYY-MM-DD' → Date local à meia-noite (sem passar por UTC). */
function parseISODate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/**
 * Agrupa os gastos por dia, do mais recente para o mais antigo.
 * O total de cada dia é somado em CENTAVOS INTEIROS: é a única soma repetida
 * de dinheiro no web, e `0.1 + 0.2 = 0.30000000000000004` não pode aparecer.
 */
export function groupByDay(expenses: VariableExpense[]): DayGroup[] {
  const byDate = new Map<string, VariableExpense[]>()

  for (const expense of expenses) {
    const list = byDate.get(expense.spentOn)
    if (list === undefined) {
      byDate.set(expense.spentOn, [expense])
    } else {
      list.push(expense)
    }
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([date, list]) => {
      let cents = 0
      for (const expense of list) cents += Math.round(Number(expense.amount) * 100)
      return { date, total: cents / 100, expenses: list }
    })
}

/**
 * Rótulo humano do dia: 'Hoje, 04/08', 'Ontem, 03/08' ou 'dom, 02/08'.
 * `today` entra por parâmetro para o teste não depender do relógio.
 */
export function dayLabel(isoDate: string, today: Date): string {
  const date = parseISODate(isoDate)
  const dayMonth = `${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}`

  const midnightToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const diffDays = Math.round((midnightToday.getTime() - date.getTime()) / 86_400_000)

  if (diffDays === 0) return `Hoje, ${dayMonth}`
  if (diffDays === 1) return `Ontem, ${dayMonth}`
  return `${WEEKDAYS_PT[date.getDay()]}, ${dayMonth}`
}
