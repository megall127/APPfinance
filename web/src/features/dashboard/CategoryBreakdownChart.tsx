import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatBRL } from '@/lib/format'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { TooltipContentProps } from 'recharts'
import type { CategoryBreakdown } from './useDashboard'

// ── Custom tooltip (function form — avoids ReactElement prop-injection typing) ──

function categoryTooltipContent({
  active,
  payload,
}: TooltipContentProps) {
  if (!active || !payload.length) return null
  const item = payload[0]
  return (
    <div className="rounded-lg border bg-card shadow-md p-2.5 text-xs space-y-0.5">
      <p className="font-semibold text-foreground">{String(item.name ?? '')}</p>
      <p className="text-muted-foreground">{formatBRL(Number(item.value ?? 0))}</p>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface CategoryBreakdownChartProps {
  data: CategoryBreakdown[] | undefined
  isLoading: boolean
}

export function CategoryBreakdownChart({
  data,
  isLoading,
}: CategoryBreakdownChartProps) {
  if (isLoading) {
    return (
      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <Skeleton className="h-5 w-44" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full rounded-xl" />
        </CardContent>
      </Card>
    )
  }

  const chartData = data ?? []
  const hasData = chartData.length > 0 && chartData.some((d) => d.total > 0)

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold">
          Gastos por Categoria
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="flex h-[300px] items-center justify-center">
            <p className="text-sm text-muted-foreground">
              Sem lançamentos no período selecionado
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="45%"
                innerRadius="45%"
                outerRadius="70%"
                dataKey="total"
                nameKey="name"
                paddingAngle={2}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={categoryTooltipContent} />
              <Legend
                iconType="circle"
                iconSize={8}
                formatter={(value) => (
                  <span className="text-xs text-foreground">{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
