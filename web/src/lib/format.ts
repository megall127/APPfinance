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
  // Intl inserts NBSP (U+00A0) or narrow NBSP (U+202F) between R$ and the
  // number; normalise both to a regular space for reliable comparisons.
  return brlFormatter.format(n).replace(/[\u00A0\u202F]/g, ' ')
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

const percentFormatters = new Map<number, Intl.NumberFormat>()

/** Returns (and caches) a pt-BR percent formatter with a fixed number of decimals. */
function percentFormatter(casas: number): Intl.NumberFormat {
  const cached = percentFormatters.get(casas)
  if (cached) return cached
  const formatter = new Intl.NumberFormat('pt-BR', {
    style: 'percent',
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  })
  percentFormatters.set(casas, formatter)
  return formatter
}

/**
 * Formats a rate FRACTION as a pt-BR percentage: 0.0118757178 -> "1,1876%".
 * `casas` is the fixed number of decimal places (4 by default).
 * Normalises non-breaking spaces (U+00A0, U+202F) inserted by Intl
 * to regular spaces, exactly like formatBRL.
 */
export function formatPercentBR(fraction: number, casas = 4): string {
  return percentFormatter(casas).format(fraction).replace(/[\u00A0\u202F]/g, ' ')
}

/** Rate value formatter: drops useless trailing zeros ("102.000000" -> "102"). */
const rateValueFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 6,
})

/** Unit written right after the configured rate value, per `rateKind`. */
const RATE_KIND_UNIT: Record<string, string> = {
  monthly: '% a.m.',
  yearly: '% a.a.',
  cdi: '% do CDI',
}

/**
 * Builds the human label of a configured rate.
 *   ('cdi', '102.000000', 0.0118757178) -> "102% do CDI · ≈1,19% a.m."
 *   ('monthly', '0.850000', 0.0085)     -> "0,85% a.m."
 *   ('yearly', '12.500000', 0.009853)   -> "12,5% a.a. · ≈0,99% a.m."
 * `value` is the PERCENTAGE as the API stores it (decimal string), while
 * `monthlyRate` is the effective monthly rate as a FRACTION — null when it
 * cannot be resolved (e.g. no CDI for the month), and then the "≈" suffix
 * is omitted. For `monthly` the value already IS the monthly rate, so the
 * suffix would only repeat it.
 */
export function formatRateLabel(
  kind: string,
  value: string,
  monthlyRate: number | null
): string {
  const parsed = Number(value)
  const percent = Number.isFinite(parsed) ? rateValueFormatter.format(parsed) : value
  const label = `${percent}${RATE_KIND_UNIT[kind] ?? '%'}`
  if (kind === 'monthly' || monthlyRate === null || !Number.isFinite(monthlyRate)) return label
  return `${label} · ≈${formatPercentBR(monthlyRate, 2)} a.m.`
}
