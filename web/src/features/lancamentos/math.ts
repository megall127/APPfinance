import type { EntryRow } from './useEntries'

/**
 * Parses a user-typed amount into a plain number.
 *
 * Accepts Brazilian-style input where '.' is the thousands separator and ','
 * is the decimal separator, as well as plain dot-decimal input:
 *   "264,60"    → 264.6
 *   "1.234,56"  → 1234.56
 *   "1234.56"   → 1234.56
 *   "abc" / ""  → null
 *   negatives   → null (amounts can't be negative)
 *
 * Returns null for blank, non-numeric, or negative input.
 */
export function parseAmountInput(input: string): number | null {
  const trimmed = input.trim()
  if (trimmed === '') return null

  let normalised: string
  if (trimmed.includes(',')) {
    // Brazilian format: strip '.' thousands separators, then ',' → '.'
    normalised = trimmed.replace(/\./g, '').replace(/,/g, '.')
  } else {
    // Plain format: '.' is already the decimal separator
    normalised = trimmed
  }

  const parsed = Number(normalised)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return parsed
}

export interface MonthSummary {
  total: number
  pago: number
  falta: number
}

/**
 * Computes the month totals from the loaded entry rows, client-side.
 *
 * Only EXPENSE items with a non-null entry count toward the totals
 * (income/card items and items without an entry are excluded).
 *   total = sum of expense amounts
 *   pago  = sum of expense amounts whose entry status is 'paid'
 *   falta = total − pago
 */
export function computeMonthSummary(rows: EntryRow[]): MonthSummary {
  let total = 0
  let pago = 0
  for (const { item, entry } of rows) {
    if (item.kind !== 'expense' || !entry) continue
    const amount = Number(entry.amount)
    if (!Number.isFinite(amount)) continue
    total += amount
    if (entry.status === 'paid') pago += amount
  }
  return { total, pago, falta: total - pago }
}
