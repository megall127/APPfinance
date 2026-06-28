import { useRef, useState, type KeyboardEvent } from 'react'
import { Input } from '@/components/ui/input'
import type { Entry } from './useEntries'

interface EditableAmountProps {
  entry: Entry | null
  onCommit: (amount: number) => void
  disabled?: boolean
}

/**
 * Inline numeric input for the entry amount.
 * Accepts Brazilian decimal separator (comma → dot) or plain dot notation.
 * Fires onCommit on blur or Enter, only when the value changed and is valid.
 */
export function EditableAmount({
  entry,
  onCommit,
  disabled = false,
}: EditableAmountProps) {
  const currentAmount = entry ? Number(entry.amount) : 0
  // Display the stored amount as a string; empty string when there's no entry
  const [raw, setRaw] = useState<string>(
    entry ? String(currentAmount) : ''
  )
  // Track what was last committed so we avoid redundant upserts
  const committedRef = useRef<string>(raw)

  // Sync displayed value when the entry changes from outside (e.g. optimistic revert)
  // Only reset the field if the committed value matches the server (i.e. we haven't
  // diverged from what the server says), so we don't overwrite an in-progress edit.
  const syncKey = entry?.id ?? 'none'
  const lastSyncKey = useRef<string>(syncKey)
  if (lastSyncKey.current !== syncKey) {
    lastSyncKey.current = syncKey
    const newDisplay = entry ? String(Number(entry.amount)) : ''
    setRaw(newDisplay)
    committedRef.current = newDisplay
  }

  function parseBRL(value: string): number | null {
    // Replace comma decimal separator with dot
    const normalised = value.trim().replace(',', '.')
    const parsed = parseFloat(normalised)
    if (Number.isNaN(parsed) || parsed < 0) return null
    return parsed
  }

  function tryCommit() {
    if (raw === committedRef.current) return
    const parsed = parseBRL(raw)
    if (parsed === null) {
      // Reset to last committed value on invalid input
      setRaw(committedRef.current)
      return
    }
    const roundedStr = parsed.toFixed(2)
    // Avoid calling onCommit when parsed value didn't change numerically
    if (roundedStr === parseBRL(committedRef.current)?.toFixed(2)) {
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

  return (
    <Input
      type="text"
      inputMode="decimal"
      value={raw}
      placeholder="0,00"
      disabled={disabled}
      className="w-28 text-right tabular-nums h-8 text-sm"
      onChange={(e) => setRaw(e.target.value)}
      onBlur={tryCommit}
      onKeyDown={handleKeyDown}
    />
  )
}
