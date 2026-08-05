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
  /** A parcela do total que veio da aba Gastos (item com `autoSource`). */
  gastosAvulsos: number
  /** Sum of EXPENSE amounts whose entry is paid — CONTAS only, no gasto avulso. */
  pago: number
  /** total − gastosAvulsos − pago. */
  falta: number
  /** Sum of INCOME amounts actually recorded this month. */
  receitas: number
  /** receitas − total. */
  saldo: number
}

/**
 * Computes the month totals from the loaded entry rows, client-side.
 *
 * Espelha regra a regra o DashboardService.monthSummary — as duas telas mostram
 * os mesmos rótulos e precisam mostrar os mesmos números:
 *
 * 1. Conta o REALIZADO, nunca o planejado: item sem lançamento no mês não entra
 *    em soma nenhuma, mesmo que a grade exiba o `defaultAmount` em itálico.
 * 2. O item-espelho da aba Gastos (`autoSource`) fica FORA de pago/falta. Ele
 *    chega com status 'paid' porque o dinheiro de fato saiu, mas não é conta
 *    paga: somá-lo em `pago` fazia Lançamentos exibir R$ 2.852,57 onde o
 *    dashboard exibia R$ 2.500,00.
 *
 *   total         = soma das entries de kind='expense'
 *   gastosAvulsos = a parte de `total` que veio de item com autoSource
 *   pago          = contas (não-auto) de kind='expense' com status 'paid'
 *   falta         = total − gastosAvulsos − pago
 *   receitas      = soma das entries de kind='income'
 *
 * Invariante: pago + falta + gastosAvulsos === total
 */
export function computeMonthSummary(rows: EntryRow[]): MonthSummary {
  let total = 0
  let gastosAvulsos = 0
  let pago = 0
  let receitas = 0
  for (const { item, entry } of rows) {
    if (!entry) continue

    const amount = Number(entry.amount)
    if (!Number.isFinite(amount)) continue

    if (item.kind === 'expense') {
      total += amount
      if (item.autoSource != null) {
        gastosAvulsos += amount
      } else if (entry.status === 'paid') {
        pago += amount
      }
    } else if (item.kind === 'income') {
      receitas += amount
    }
    // card_subscription is excluded from the month total (anti-double-counting)
  }
  return {
    total,
    gastosAvulsos,
    pago,
    falta: total - gastosAvulsos - pago,
    receitas,
    saldo: receitas - total,
  }
}
