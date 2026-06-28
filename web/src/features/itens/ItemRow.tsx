import { Pencil, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatBRL } from '@/lib/format'
import type { Item } from './useItems'

// ── Shared item row ───────────────────────────────────────────────────────────
//
// Used by ItensPage (as "ItemRow") and AssinaturasPage (was "SubscriptionRow").
// The two rows were structurally identical — this single component replaces both.

export interface ItemRowProps {
  item: Item
  categoryName?: string
  categoryColor?: string
  onEdit: (item: Item) => void
  onDelete: (item: Item) => void
}

export function ItemRow({
  item,
  categoryName,
  categoryColor,
  onEdit,
  onDelete,
}: ItemRowProps) {
  const isActive = Boolean(item.isActive)
  const amount = item.defaultAmount ? Number(item.defaultAmount) : null

  return (
    <div
      className={`flex items-center gap-3 py-3 px-4 rounded-lg hover:bg-muted/50 transition-colors group ${
        !isActive ? 'opacity-50' : ''
      }`}
    >
      {/* Name + inactive badge */}
      <div className="flex-1 min-w-0">
        <span className="font-medium text-sm text-foreground truncate block">
          {item.name}
          {!isActive && (
            <Badge variant="secondary" className="ml-2 text-xs">
              Inativo
            </Badge>
          )}
        </span>
      </div>

      {/* Category badge */}
      {categoryName && (
        <span
          className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full text-white shrink-0"
          style={{ backgroundColor: categoryColor ?? '#94a3b8' }}
        >
          {categoryName}
        </span>
      )}

      {/* Default amount */}
      {amount !== null && !isNaN(amount) && (
        <span className="text-sm tabular-nums text-foreground/80 shrink-0">
          {formatBRL(amount)}
        </span>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Editar"
          onClick={() => onEdit(item)}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive hover:text-destructive"
          aria-label="Excluir"
          onClick={() => onDelete(item)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
