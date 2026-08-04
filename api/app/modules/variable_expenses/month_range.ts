import { DateTime } from 'luxon'

/**
 * Primeiro e ultimo dia do mes, em 'YYYY-MM-DD', para usar num BETWEEN de coluna DATE.
 * Luxon resolve bissexto e virada de ano sozinho — nao existe aritmetica de dias aqui.
 */
export function monthRange(year: number, month: number): [string, string] {
  const start = DateTime.fromObject({ year, month, day: 1 })
  return [start.toISODate()!, start.endOf('month').toISODate()!]
}

/**
 * Normaliza o retorno de um SUM(decimal) para o formato que a coluna
 * monthly_entries.amount espera.
 *
 * O mysql2 devolve DECIMAL como STRING ('487.60'), que ja e o valor exato — ela
 * passa adiante intacta, sem virar float no caminho. Numero e null existem so
 * como defesa contra driver configurado diferente e contra mes vazio.
 */
export function toAmountString(value: unknown): string {
  if (value === null || value === undefined) return '0.00'
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value)) return value
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return '0.00'
  return parsed.toFixed(2)
}

/** True quando o total do mes e zero, em qualquer grafia ('0', '0.00', '0.000'). */
export function isZeroAmount(amount: string): boolean {
  return Number(amount) === 0
}
