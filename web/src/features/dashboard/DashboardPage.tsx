import { useState } from 'react'
import { useDashboard, useYearly } from './useDashboard'
import { MonthYearPicker } from './MonthYearPicker'
import { SummaryCards } from './SummaryCards'
import { CategoryBreakdownChart } from './CategoryBreakdownChart'
import { YearlyEvolutionChart } from './YearlyEvolutionChart'

export default function DashboardPage() {
  // Default to the current year and 1-based month.
  // Lazy initializers so new Date() is only allocated once, not every render.
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [month, setMonth] = useState(() => new Date().getMonth() + 1) // getMonth() is 0-based → +1

  const { data: dashData, isLoading: dashLoading } = useDashboard(year, month)
  const { data: yearlyData, isLoading: yearlyLoading } = useYearly(year)

  return (
    <div className="space-y-6">
      {/* ── Page header + picker ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Visão geral das finanças do período selecionado
          </p>
        </div>
        <MonthYearPicker
          year={year}
          month={month}
          onYearChange={setYear}
          onMonthChange={setMonth}
        />
      </div>

      {/* ── Summary cards ── */}
      <SummaryCards data={dashData} isLoading={dashLoading} />

      {/* ── Charts: yearly evolution (left) + category breakdown (right) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <YearlyEvolutionChart
          data={yearlyData?.months}
          isLoading={yearlyLoading}
        />
        <CategoryBreakdownChart
          data={dashData?.breakdownPorCategoria}
          isLoading={dashLoading}
        />
      </div>
    </div>
  )
}
