import { formatBRL } from '@/lib/format'
import { dayLabel, type DayGroup as DayGroupData } from './grouping'
import { ExpenseRow } from './ExpenseRow'
import type { VariableExpense } from './useVariableExpenses'

interface DayGroupProps {
  group: DayGroupData
  /** Injetado para o teste não depender do relógio. */
  today: Date
  categoryById: Map<string, { name: string; color: string }>
  onSelect: (expense: VariableExpense) => void
}

/** Cabeçalho do dia ("Hoje, 04/08" + total) seguido dos gastos daquele dia. */
export function DayGroup({ group, today, categoryById, onSelect }: DayGroupProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between border-b border-border pb-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {dayLabel(group.date, today)}
        </span>
        <span className="text-xs font-medium tabular-nums text-muted-foreground">
          {formatBRL(group.total)}
        </span>
      </div>
      {group.expenses.map((expense) => (
        <ExpenseRow
          key={expense.id}
          expense={expense}
          categoryById={categoryById}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}
