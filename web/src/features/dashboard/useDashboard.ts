import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'

// ── Response shapes ────────────────────────────────────────────────────────────

export interface CategoryBreakdown {
  categoryId: string
  name: string
  color: string
  total: number
}

export interface DashboardData {
  totalDoMes: number
  jaPago: number
  faltaPagar: number
  /** 0..1 fraction, e.g. 0.75 = 75% */
  percentualPago: number
  receitas: number
  saldo: number
  assinaturasCartao: number
  breakdownPorCategoria: CategoryBreakdown[]
}

export interface MonthlyEntry {
  /** 1-based month (1 = Jan, 12 = Dec) */
  month: number
  total: number
  paid: number
}

export interface YearlyData {
  months: MonthlyEntry[]
}

// ── Hooks ──────────────────────────────────────────────────────────────────────

/**
 * Fetches dashboard summary for a given year/month.
 * `month` is 1-based (1..12) and passed directly to the API.
 */
export function useDashboard(year: number, month: number) {
  return useQuery<DashboardData>({
    queryKey: ['dashboard', year, month],
    queryFn: async () => {
      const { data } = await api.get<DashboardData>('/dashboard', {
        params: { year, month },
      })
      return data
    },
  })
}

/**
 * Fetches yearly evolution data (12 months) for the given year.
 */
export function useYearly(year: number) {
  return useQuery<YearlyData>({
    queryKey: ['dashboard-yearly', year],
    queryFn: async () => {
      const { data } = await api.get<YearlyData>('/dashboard/yearly', {
        params: { year },
      })
      return data
    },
  })
}
