import { useQueries } from '@tanstack/react-query'
import api from '@/lib/api'
import type { YearlyData, MonthlyEntry } from '@/features/dashboard/useDashboard'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface YearHistory {
  year: number
  months: MonthlyEntry[]
  isLoading: boolean
  isError: boolean
}

// ── Hook ───────────────────────────────────────────────────────────────────────

/**
 * Fetches yearly data for multiple years in parallel using `useQueries`.
 * Shares the `['dashboard-yearly', year]` cache key with the dashboard hook.
 */
export function useHistory(years: number[]): {
  perYear: YearHistory[]
  isLoading: boolean
} {
  const results = useQueries({
    queries: years.map((year) => ({
      queryKey: ['dashboard-yearly', year] as const,
      queryFn: async (): Promise<YearlyData> => {
        const { data } = await api.get<YearlyData>('/dashboard/yearly', {
          params: { year },
        })
        return data
      },
    })),
  })

  const perYear: YearHistory[] = results.map((result, i) => ({
    year: years[i]!,
    months: result.data?.months ?? [],
    isLoading: result.isLoading,
    isError: result.isError,
  }))

  const isLoading = results.some((r) => r.isLoading)

  return { perYear, isLoading }
}
