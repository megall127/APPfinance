/**
 * Shared colour palette for the histórico feature.
 * The Nth selected year gets `CHART_SERIES_COLORS[n % length]` in BOTH the
 * comparison chart line and its summary card, so colours stay in sync.
 */
export const CHART_SERIES_COLORS = [
  '#6366f1', // indigo
  '#f59e0b', // amber
  '#10b981', // emerald
  '#ef4444', // red
  '#8b5cf6', // violet
  '#06b6d4', // cyan
] as const

export function seriesColor(index: number): string {
  return CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length]!
}
