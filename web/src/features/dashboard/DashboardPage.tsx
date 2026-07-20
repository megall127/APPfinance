import { useState } from 'react'
import { useDashboard, useYearly } from './useDashboard'
import { MonthYearPicker } from './MonthYearPicker'
import { ResumoPanel } from './panels/ResumoPanel'
import { BalancoPanel } from './panels/BalancoPanel'
import { YearlyEvolutionChart } from './YearlyEvolutionChart'
import { CategoryBreakdownChart } from './CategoryBreakdownChart'
import { Carousel, CarouselItem } from '@/components/ui/carousel'

export default function DashboardPage() {
  // Ano atual e mês 1-based; inicializadores lazy (new Date() só uma vez).
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [month, setMonth] = useState(() => new Date().getMonth() + 1)

  const { data: dashData, isLoading: dashLoading, isError: dashError } = useDashboard(year, month)
  const { data: yearlyData, isLoading: yearlyLoading } = useYearly(year)

  return (
    <div className="space-y-6">
      {/* Cabeçalho + seletor */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
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

      {dashError && !dashLoading && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Erro ao carregar os dados do período. Tente novamente.
        </div>
      )}

      {/* Carrossel de painéis (mobile) → grade 2×2 (lg) */}
      <Carousel gridClassName="lg:grid-cols-2">
        <CarouselItem>
          <ResumoPanel data={dashData} isLoading={dashLoading} />
        </CarouselItem>
        <CarouselItem>
          <BalancoPanel data={dashData} isLoading={dashLoading} />
        </CarouselItem>
        <CarouselItem>
          <YearlyEvolutionChart data={yearlyData?.months} isLoading={yearlyLoading} />
        </CarouselItem>
        <CarouselItem>
          <CategoryBreakdownChart data={dashData?.breakdownPorCategoria} isLoading={dashLoading} />
        </CarouselItem>
      </Carousel>
    </div>
  )
}
