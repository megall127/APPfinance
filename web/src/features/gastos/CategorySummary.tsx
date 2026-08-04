import { formatBRL } from '@/lib/format'
import type { CategoryTotal } from './useVariableExpenses'

interface CategorySummaryProps {
  byCategory: CategoryTotal[]
}

/** Chips com a cor da categoria e o total gasto nela no mês. */
export function CategorySummary({ byCategory }: CategorySummaryProps) {
  if (byCategory.length === 0) return null

  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-2">
      {byCategory.map((entry) => (
        <span
          key={entry.categoryId ?? '__none__'}
          className="inline-flex items-center gap-1.5 text-sm"
        >
          <span
            className="inline-block h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: entry.color ?? '#94a3b8' }}
          />
          <span className="text-muted-foreground">{entry.name ?? 'Sem categoria'}</span>
          <span className="font-medium tabular-nums">{formatBRL(entry.total)}</span>
        </span>
      ))}
    </div>
  )
}
