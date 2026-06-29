import { useRef, useState, type KeyboardEvent } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { Entry } from './useEntries'
import { parseAmountInput } from './math'

interface EditableAmountProps {
  entry: Entry | null
  /** Item's saved default amount (decimal string); shown as a suggestion when there's no entry. */
  defaultAmount?: string | null
  onCommit: (amount: number) => void
  disabled?: boolean
}

/**
 * Inline numeric input for the entry amount.
 * - With a saved entry: shows the entry amount.
 * - With no entry but an item default: pre-fills the default (muted) as a suggestion;
 *   confirming the field (blur / Enter) saves it as the month's value.
 * Accepts Brazilian decimal separator (comma → dot) or plain dot notation.
 * Fires onCommit only when the value is valid and differs from the committed baseline.
 */
export function EditableAmount({
  entry,
  defaultAmount,
  onCommit,
  disabled = false,
}: EditableAmountProps) {
  const entryDisplay = entry ? String(Number(entry.amount)) : ''
  const defaultDisplay =
    defaultAmount != null &&
    defaultAmount !== '' &&
    Number.isFinite(Number(defaultAmount))
      ? String(Number(defaultAmount))
      : ''

  const [raw, setRaw] = useState<string>(entry ? entryDisplay : defaultDisplay)
  // Committed baseline. For a saved entry it's the entry value (avoids redundant
  // upserts). With no entry it's empty — so a shown default still commits when the
  // user confirms the field, but the field never auto-creates an entry on render.
  const committedRef = useRef<string>(entry ? entryDisplay : '')

  // Re-sync when the entry identity changes (created, removed, optimistic→real, reverted).
  const syncKey = entry?.id ?? 'none'
  const lastSyncKey = useRef<string>(syncKey)
  if (lastSyncKey.current !== syncKey) {
    lastSyncKey.current = syncKey
    setRaw(entry ? entryDisplay : defaultDisplay)
    committedRef.current = entry ? entryDisplay : ''
  }

  function tryCommit() {
    if (raw === committedRef.current) return
    const parsed = parseAmountInput(raw)
    if (parsed === null) {
      // Reset to last committed value on invalid input
      setRaw(committedRef.current)
      return
    }
    const roundedStr = parsed.toFixed(2)
    // Avoid calling onCommit when the value didn't change numerically
    if (roundedStr === parseAmountInput(committedRef.current)?.toFixed(2)) {
      setRaw(roundedStr)
      committedRef.current = roundedStr
      return
    }
    committedRef.current = roundedStr
    setRaw(roundedStr)
    onCommit(parsed)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.currentTarget.blur()
    }
    if (e.key === 'Escape') {
      setRaw(committedRef.current)
      e.currentTarget.blur()
    }
  }

  // The field is showing the item's default as an unsaved suggestion.
  const showingDefault =
    !entry && defaultDisplay !== '' && raw === defaultDisplay

  return (
    <Input
      type="text"
      inputMode="decimal"
      value={raw}
      placeholder="0,00"
      disabled={disabled}
      title={
        showingDefault ? 'Valor padrão do item — confirme para salvar' : undefined
      }
      className={cn(
        'w-28 text-right tabular-nums h-8 text-sm',
        showingDefault && 'text-muted-foreground italic'
      )}
      onChange={(e) => setRaw(e.target.value)}
      onBlur={tryCommit}
      onKeyDown={handleKeyDown}
    />
  )
}
