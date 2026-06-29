import { TableCell, TableRow } from '@/components/ui/table'
import { EditableAmount } from './EditableAmount'
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
      {/* Item name */}
      <TableCell className="font-medium">{item.name}</TableCell>

      {/* Editable amount */}
      <TableCell className="text-right">
        <EditableAmount
          entry={entry}
          defaultAmount={item.defaultAmount}
          onCommit={handleCommit}
        />
      </TableCell>

      {/* Status toggle */}
      <TableCell>
        <StatusToggle
          entry={entry}
          onToggle={handleToggle}
          isPending={toggleBusy}
        />
      </TableCell>
    </TableRow>
  )
}
