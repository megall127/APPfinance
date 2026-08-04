import { Link } from 'react-router-dom'
import { TableCell, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { EditableAmount } from './EditableAmount'
import { LockedAmount } from './LockedAmount'
import { StatusToggle } from './StatusToggle'
import type { EntryRow as EntryRowData } from './useEntries'
import { useUpsertEntry, useTogglePaid } from './useEntries'

interface EntryRowProps {
  row: EntryRowData
  year: number
  month: number
}

export function EntryRow({ row, year, month }: EntryRowProps) {
  const { item, entry } = row
  // Item gerado pela aba Gastos: valor calculado, sempre pago, editável só de lá.
  const isAuto = item.autoSource != null
  const { mutate: upsert, isPending: upserting } = useUpsertEntry(year, month)
  const { mutate: toggle, isPending: toggling } = useTogglePaid(year, month)

  function handleCommit(amount: number) {
    upsert({ itemId: item.id, year, month, amount })
  }

  function handleToggle() {
    if (!entry || entry.id === '__optimistic__') return
    toggle({ entryId: entry.id, itemId: item.id })
  }

  // Disable the toggle while the entry is mid-creation (optimistic id) or
  // either mutation is in flight, so the click isn't a silent no-op.
  const toggleBusy = toggling || upserting || entry?.id === '__optimistic__'

  return (
    <TableRow>
      {/* Item name (+ installment progress when parcelado) */}
      <TableCell className="font-medium">
        <span className="flex items-center gap-2">
          {item.name}
          {item.installmentsTotal != null && (
            <Badge
              variant="outline"
              className="text-[10px] font-normal text-muted-foreground px-1.5 py-0"
              title={`Parcela ${item.installmentsPaid ?? 0} de ${item.installmentsTotal}`}
            >
              {item.installmentsPaid ?? 0}/{item.installmentsTotal}
            </Badge>
          )}
        </span>
      </TableCell>

      {/* Editable amount — travado quando o item é gerado pela aba Gastos */}
      <TableCell className="text-right">
        {isAuto ? (
          <LockedAmount amount={entry?.amount ?? null} />
        ) : (
          <EditableAmount
            entry={entry}
            defaultAmount={item.defaultAmount}
            onCommit={handleCommit}
          />
        )}
      </TableCell>

      {/* Status — a linha automática conta sempre como paga */}
      <TableCell>
        {isAuto ? (
          <Link
            to="/gastos"
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            ver gastos
          </Link>
        ) : (
          <StatusToggle
            entry={entry}
            kind={item.kind}
            onToggle={handleToggle}
            isPending={toggleBusy}
          />
        )}
      </TableCell>
    </TableRow>
  )
}
