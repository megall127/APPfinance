import { useState } from 'react'
import { TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatBRL } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useHistory } from './useHistory'
import { YearCompareChart } from './YearCompareChart'
import { seriesColor } from './colors'

// ── Year range ─────────────────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear()

/** Show the last 4 years including the current one. */
const YEAR_RANGE: number[] = Array.from(
  { length: 4 },
  (_, i) => CURRENT_YEAR - 3 + i,
)

// ── Page ───────────────────────────────────────────────────────────────────────

export default function HistoricoPage() {
  // Default: current year and the previous one (sorted ascending)
  const [selectedYears, setSelectedYears] = useState<number[]>([
    CURRENT_YEAR - 1,
    CURRENT_YEAR,
  ])

  function toggleYear(year: number) {
    setSelectedYears((prev) =>
      prev.includes(year)
        ? prev.filter((y) => y !== year)
        : [...prev, year].sort((a, b) => a - b),
    )
  }

  const { perYear, isLoading } = useHistory(selectedYears)

  return (
    <div className="space-y-6">
      {/* ── Page header + year selector ── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <TrendingUp className="h-6 w-6 text-primary shrink-0" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Histórico
            </h1>
            <p className="text-sm text-muted-foreground">
              Comparativo de despesas entre anos
            </p>
          </div>
        </div>

        {/* Year toggle chips */}
        <div className="flex flex-wrap gap-2">
          {YEAR_RANGE.map((year) => {
            const active = selectedYears.includes(year)
            return (
              <button
                key={year}
                onClick={() => toggleYear(year)}
                className={cn(
                  'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  active
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-foreground border-border hover:bg-accent hover:text-accent-foreground',
                )}
              >
                {year}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Annual totals summary cards ── */}
      {selectedYears.length > 0 && (
        <div className="flex flex-wrap gap-4">
          {perYear.map((yd, i) => {
            const annualTotal = yd.months.reduce(
              (sum, m) => sum + m.total,
              0,
            )
            const color = seriesColor(i)
            return (
              <Card
                key={yd.year}
                className="rounded-2xl shadow-sm min-w-[160px] flex-1 basis-36"
              >
                <CardHeader className="pb-1 pt-4 px-4">
                  <CardTitle className="text-xs font-medium text-muted-foreground">
                    Total {yd.year}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  {yd.isLoading ? (
                    <Skeleton className="h-7 w-32" />
                  ) : yd.isError ? (
                    <p className="text-sm text-destructive">
                      Erro ao carregar
                    </p>
                  ) : (
                    <p
                      className="text-xl font-bold"
                      style={{ color }}
                    >
                      {formatBRL(annualTotal)}
                    </p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* ── Year compare chart ── */}
      <YearCompareChart
        yearData={perYear}
        selectedYears={selectedYears}
        isLoading={isLoading}
      />
    </div>
  )
}
