import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatBRL, MONTHS_PT } from '@/lib/format'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { TooltipContentProps } from 'recharts'
import type { YearHistory } from './useHistory'

// ── Palette ────────────────────────────────────────────────────────────────────

const YEAR_COLORS = [
  '#6366f1', // indigo
  '#f59e0b', // amber
  '#10b981', // emerald
  '#ef4444', // red
  '#8b5cf6', // violet
  '#06b6d4', // cyan
]

// ── Compact BRL for Y-axis ─────────────────────────────────────────────────────

const compactFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 0,
})

function compactBRL(v: number): string {
  return compactFormatter.format(v)
}

// ── Custom tooltip ─────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-card shadow-md p-2.5 text-xs space-y-1">
      <p className="font-semibold text-foreground">
        {label !== undefined ? String(label) : ''}
      </p>
      {payload.map((entry, i) => (
        <p key={i} style={{ color: entry.color ?? undefined }}>
          {String(entry.name ?? '')}: {formatBRL(Number(entry.value ?? 0))}
        </p>
      ))}
    </div>
  )
}

// ── Chart data type ────────────────────────────────────────────────────────────

type ChartRow = { monthLabel: string } & Record<string, string | number>

// ── Main component ─────────────────────────────────────────────────────────────

interface YearCompareChartProps {
  yearData: YearHistory[]
  selectedYears: number[]
  isLoading: boolean
}

export function YearCompareChart({
  yearData,
  selectedYears,
  isLoading,
}: YearCompareChartProps) {
  // Loading state
  if (isLoading) {
    return (
      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[320px] w-full rounded-xl" />
        </CardContent>
      </Card>
    )
  }

  // No years selected
  if (selectedYears.length === 0) {
    return (
      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            Comparativo por Ano
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-[320px] items-center justify-center">
            <p className="text-sm text-muted-foreground">
              Selecione ao menos um ano para visualizar o gráfico
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Build 12-row chart dataset: { monthLabel, '2024': n, '2025': n, ... }
  // month is 1-based; MONTHS_PT is 0-indexed → MONTHS_PT[month - 1]
  const chartData: ChartRow[] = MONTHS_PT.map((label, idx) => {
    const row: ChartRow = { monthLabel: label }
    for (const yd of yearData) {
      const entry = yd.months.find((m) => m.month === idx + 1)
      row[String(yd.year)] = entry?.total ?? 0
    }
    return row
  })

  const hasData = yearData.some((yd) => yd.months.some((m) => m.total > 0))

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold">
          Comparativo por Ano
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="flex h-[320px] items-center justify-center">
            <p className="text-sm text-muted-foreground">
              Sem dados para os anos selecionados
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart
              data={chartData}
              margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#E5E7EB"
                vertical={false}
              />
              <XAxis
                dataKey="monthLabel"
                tick={{ fontSize: 12, fill: '#6B7280' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={compactBRL}
                width={72}
                tick={{ fontSize: 11, fill: '#6B7280' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={ChartTooltip} />
              <Legend
                iconType="circle"
                iconSize={8}
                formatter={(value) => (
                  <span className="text-xs text-foreground">{value}</span>
                )}
              />
              {selectedYears.map((year, i) => (
                <Line
                  key={year}
                  type="monotone"
                  dataKey={String(year)}
                  name={String(year)}
                  stroke={YEAR_COLORS[i % YEAR_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{
                    r: 4,
                    fill: YEAR_COLORS[i % YEAR_COLORS.length],
                  }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
