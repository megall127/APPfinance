import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { TooltipContentProps } from 'recharts'
import { formatBRL } from '@/lib/format'
import type { ProjectionPoint } from './interest'

/**
 * Curva do simulador (§7.4). Duas áreas NÃO empilhadas: o que foi aportado e o
 * saldo com rendimento — a área entre as duas É o efeito dos juros compostos.
 *
 * Recebe os pontos já calculados por `projectMonths` (em CENTAVOS) para que o
 * badge de meta e a curva venham SEMPRE da mesma recorrência.
 * Cores são hex literais (mesmo boilerplate de `YearlyEvolutionChart`).
 */

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

function areaTooltipContent({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-card shadow-md p-2.5 text-xs space-y-1">
      <p className="font-semibold text-foreground">
        {label !== undefined ? `Mês ${String(label)}` : ''}
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

interface ProjectionChartProps {
  /** Pontos de `projectMonths` — valores em CENTAVOS. */
  points: ProjectionPoint[]
}

export function ProjectionChart({ points }: ProjectionChartProps) {
  // Nunca `return null`: sem pontos o gráfico vira um estado vazio textual com
  // a MESMA altura, senão o card colapsa a cada tecla apagada.
  if (points.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center">
        <p className="text-sm text-muted-foreground">
          Informe um aporte e um prazo para ver a projeção
        </p>
      </div>
    )
  }

  // Centavos → reais só na borda de renderização (§5.0).
  const chartData = points.map((p) => ({
    mes: p.mes,
    aportado: p.aportadoCents / 100,
    comRendimento: p.saldoCents / 100,
  }))

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart
        data={chartData}
        margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="#E5E7EB"
          vertical={false}
        />
        <XAxis
          dataKey="mes"
          tickFormatter={(v) => `${v}m`}
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
        <Tooltip content={areaTooltipContent} />
        <Legend
          iconType="circle"
          iconSize={8}
          formatter={(value) => (
            <span className="text-xs text-foreground">{value}</span>
          )}
        />
        <Area
          type="monotone"
          dataKey="aportado"
          name="Aportado"
          stroke="#6B7280"
          strokeWidth={2}
          fill="#6B7280"
          fillOpacity={0.15}
          dot={false}
          activeDot={{ r: 4, fill: '#6B7280' }}
        />
        <Area
          type="monotone"
          dataKey="comRendimento"
          name="Com rendimento"
          stroke="#4CAF82"
          strokeWidth={2}
          fill="#4CAF82"
          fillOpacity={0.25}
          dot={false}
          activeDot={{ r: 4, fill: '#4CAF82' }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
