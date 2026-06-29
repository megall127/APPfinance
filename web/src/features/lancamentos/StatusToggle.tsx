import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Entry, ItemKind } from './useEntries'

interface StatusToggleProps {
  entry: Entry | null
  /** Item kind — income uses "A receber/Recebido" instead of "Pendente/Pago". */
  kind: ItemKind
  onToggle: () => void
  isPending?: boolean
}

/**
 * Clickable badge showing the payment status.
 * - expense / card: Pendente (yellow) ↔ Pago (green)
 * - income:         A receber (yellow) ↔ Recebido (green)
 * Disabled / hidden when there is no entry (amount never set).
 */
export function StatusToggle({ entry, kind, onToggle, isPending = false }: StatusToggleProps) {
  const isIncome = kind === 'income'
  const paidLabel = isIncome ? 'Recebido' : 'Pago'
  const pendingLabel = isIncome ? 'A receber' : 'Pendente'
  // No entry means no amount has been set yet → can't toggle
  if (!entry) {
    return (
      <Badge
        variant="outline"
        className="text-muted-foreground border-dashed cursor-not-allowed select-none"
      >
        —
      </Badge>
    )
  }

  const isPaid = entry.status === 'paid'

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={isPending}
      className={cn(
        'rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        isPending && 'opacity-60 cursor-wait'
      )}
      aria-label={
        isPaid
          ? `Marcar como ${pendingLabel.toLowerCase()}`
          : `Marcar como ${paidLabel.toLowerCase()}`
      }
    >
      <Badge
        className={cn(
          'transition-colors select-none cursor-pointer',
          isPaid
            ? 'bg-green-100 text-green-800 border-green-300 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700'
            : 'bg-yellow-100 text-yellow-800 border-yellow-300 hover:bg-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700'
        )}
        variant="outline"
      >
        {isPaid ? paidLabel : pendingLabel}
      </Badge>
    </button>
  )
}
