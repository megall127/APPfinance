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
  /** Sum of EXPENSE amounts (entries + planned defaults). */
  total: number
  /** Sum of EXPENSE amounts whose entry is paid. */
  pago: number
  /** total − pago. */
  falta: number
  /** Sum of INCOME amounts (entries + planned defaults). */
  receitas: number
  /** receitas − total. */
  saldo: number
}

/**
 * Computes the month totals from the loaded entry rows, client-side.
 *
 * EXPENSE items count toward the totals (income/card items are excluded):
 *   - with an entry  → use the entry amount; add to `pago` when status is 'paid'.
 *   - with NO entry  → use the item's `defaultAmount` as the planned (unpaid) amount,
 *                      so the suggested defaults shown in the grid are reflected here.
 *   total = sum of expense amounts (saved entries + planned defaults)
 *   pago  = sum of expense amounts whose entry status is 'paid'
 *   falta = total − pago
 */
export function computeMonthSummary(rows: EntryRow[]): MonthSummary {
  let total = 0
  let pago = 0
  let receitas = 0
  for (const { item, entry } of rows) {
    // Effective amount: the saved entry amount, or the item's default as a
    // planned value when there's no entry yet.
    let amount: number
    if (entry) {
      amount = Number(entry.amount)
      if (!Number.isFinite(amount)) continue
    } else {
      amount = Number(item.defaultAmount)
      if (!Number.isFinite(amount) || amount <= 0) continue
    }

    if (item.kind === 'expense') {
      total += amount
      if (entry && entry.status === 'paid') pago += amount
    } else if (item.kind === 'income') {
      receitas += amount
    }
    // card_subscription is excluded from the month total (anti-double-counting)
  }
  return { total, pago, falta: total - pago, receitas, saldo: receitas - total }
}
