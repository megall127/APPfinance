const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

/**
 * Formats a number as Brazilian Real (BRL).
 * Normalises non-breaking spaces (U+00A0, U+202F) inserted by Intl
 * to regular spaces so the result is a plain ASCII-friendly string.
 */
export function formatBRL(n: number): string {
  // eslint-disable-next-line no-irregular-whitespace
  return brlFormatter.format(n).replace(/[  ]/g, ' ')
}

export const MONTHS_PT = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
] as const

/**
 * Parses a month URL param (1-indexed, e.g. "3") to a 0-indexed integer.
 * Returns the current month if the param is missing or out of range.
 */
export function parseMonthParam(param: string | null | undefined): number {
  const current = new Date().getMonth()
  if (!param) return current
  const parsed = parseInt(param, 10)
  if (Number.isNaN(parsed) || parsed < 1 || parsed > 12) return current
  return parsed - 1
}
