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
import type { MonthlyEntry } from './useDashboard'

// ── Compact BRL formatter for Y-axis ticks ─────────────────────────────────────

const compactFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 0,
})

function compactBRL(v: number): string {
  return compactFormatter.format(v)
}

// ── Custom tooltip (function form) ─────────────────────────────────────────────

function lineTooltipContent({
  active,
  payload,
  label,
}: TooltipContentProps) {
  if (!active || !payload.length) return null
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

// ── Main component ─────────────────────────────────────────────────────────────

interface YearlyEvolutionChartProps {
  data: MonthlyEntry[] | undefined
  isLoading: boolean
}

export function YearlyEvolutionChart({
  data,
  isLoading,
}: YearlyEvolutionChartProps) {
  if (isLoading) {
    return (
      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <Skeleton className="h-5 w-36" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full rounded-xl" />
        </CardContent>
      </Card>
    )
  }

  // month is 1-based → MONTHS_PT is 0-indexed → MONTHS_PT[month - 1]
  const chartData = (data ?? []).map((m) => ({
    name: MONTHS_PT[m.month - 1] ?? String(m.month),
    total: m.total,
    pago: m.paid,
  }))

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold">
          Evolução Anual
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
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
              dataKey="name"
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
            <Tooltip content={lineTooltipContent} />
            <Legend
              iconType="circle"
              iconSize={8}
              formatter={(value) => (
                <span className="text-xs text-foreground">{value}</span>
              )}
            />
            <Line
              type="monotone"
              dataKey="total"
              name="Total"
              stroke="#6B7280"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#6B7280' }}
            />
            <Line
              type="monotone"
              dataKey="pago"
              name="Pago"
              stroke="#4CAF82"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#4CAF82' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
