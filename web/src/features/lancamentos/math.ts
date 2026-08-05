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
  /** Sum of EXPENSE amounts actually recorded this month. */
  total: number
  /** Sum of EXPENSE amounts whose entry is paid. */
  pago: number
  /** total − pago. */
  falta: number
  /** Sum of INCOME amounts actually recorded this month. */
  receitas: number
  /** receitas − total. */
  saldo: number
}

/**
 * Computes the month totals from the loaded entry rows, client-side.
 *
 * Conta o REALIZADO, nunca o planejado: um item sem lançamento no mês não entra
 * em soma nenhuma, mesmo que a grade exiba o `defaultAmount` em itálico como
 * sugestão. Essa é a mesma regra do dashboard (DashboardService.monthSummary faz
 * INNER JOIN monthly_entries → items), e as duas telas precisam bater — foi
 * justamente a divergência entre elas que fazia "Total do mês" mostrar dois
 * valores diferentes sob o mesmo rótulo.
 *
 *   total    = soma das entries de kind='expense'
 *   pago     = soma das entries de kind='expense' com status 'paid'
 *   falta    = total − pago
 *   receitas = soma das entries de kind='income'
 */
export function computeMonthSummary(rows: EntryRow[]): MonthSummary {
  let total = 0
  let pago = 0
  let receitas = 0
  for (const { item, entry } of rows) {
    if (!entry) continue

    const amount = Number(entry.amount)
    if (!Number.isFinite(amount)) continue

    if (item.kind === 'expense') {
      total += amount
      if (entry.status === 'paid') pago += amount
    } else if (item.kind === 'income') {
      receitas += amount
    }
    // card_subscription is excluded from the month total (anti-double-counting)
  }
  return { total, pago, falta: total - pago, receitas, saldo: receitas - total }
}
