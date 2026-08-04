import { formatBRL } from '@/lib/format'
import type { VariableExpense } from './useVariableExpenses'

interface ExpenseRowProps {
  expense: VariableExpense
  categoryById: Map<string, { name: string; color: string }>
  onSelect: (expense: VariableExpense) => void
}

/** Uma linha de gasto. A linha inteira é o alvo de toque — abre a edição. */
export function ExpenseRow({ expense, categoryById, onSelect }: ExpenseRowProps) {
  // String() obrigatório: o Map é indexado por String(category.id) e o
  // categoryId chega como NÚMERO da API — Map.get(7) nunca acha a chave '7'.
  const category =
    expense.categoryId != null ? categoryById.get(String(expense.categoryId)) : undefined

  return (
    <button
      type="button"
      onClick={() => onSelect(expense)}
      className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">
          {expense.description ?? 'Gasto sem descrição'}
        </span>
        {category !== undefined && (
          <span className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: category.color }}
            />
            {category.name}
          </span>
        )}
      </span>
      <span className="shrink-0 text-sm font-semibold tabular-nums">
        {formatBRL(Number(expense.amount))}
      </span>
    </button>
  )
}
