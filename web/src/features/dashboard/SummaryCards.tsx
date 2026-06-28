import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatBRL } from '@/lib/format'
import { TrendingUp, RefreshCw, ShieldCheck, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DashboardData } from './useDashboard'

// ── SVG Progress Ring ──────────────────────────────────────────────────────────

/** Pure SVG ring — avoids Recharts type complexity for this small widget. */
function ProgressRing({ pct }: { pct: number }) {
  const r = 34
  const circ = 2 * Math.PI * r
  const clamped = Math.min(Math.max(pct, 0), 100)
  const filled = circ * (clamped / 100)
  return (
    <svg
      width={88}
      height={88}
      viewBox="0 0 88 88"
      style={{ transform: 'rotate(-90deg)' }}
      aria-hidden="true"
    >
      {/* Track */}
      <circle cx={44} cy={44} r={r} fill="none" stroke="#F3F4F6" strokeWidth={9} />
      {/* Fill */}
      <circle
        cx={44}
        cy={44}
        r={r}
        fill="none"
        stroke="#4CAF82"
        strokeWidth={9}
        strokeDasharray={`${filled} ${circ - filled}`}
        strokeLinecap="round"
      />
    </svg>
  )
}

// ── Loading skeleton ───────────────────────────────────────────────────────────

function CardsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="rounded-2xl shadow-sm">
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-28" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-36" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="rounded-2xl shadow-sm">
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-28" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-7 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface SummaryCardsProps {
  data: DashboardData | undefined
  isLoading: boolean
}

export function SummaryCards({ data, isLoading }: SummaryCardsProps) {
  if (isLoading) return <CardsSkeleton />
  if (!data) return null

  const pct = Math.round(data.percentualPago * 100)
  const saldoPositive = data.saldo >= 0

  return (
    <div className="space-y-4">
      {/* ── Primary row: main month metrics ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

        {/* Total do mês */}
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total do mês
            </CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">
              {formatBRL(data.totalDoMes)}
            </p>
          </CardContent>
        </Card>

        {/* Já pago */}
        <Card className="rounded-2xl shadow-sm border-green-200 bg-green-50/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-green-700">
              Já pago
            </CardTitle>
            <ShieldCheck className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-700">
              {formatBRL(data.jaPago)}
            </p>
          </CardContent>
        </Card>

        {/* Falta pagar */}
        <Card className="rounded-2xl shadow-sm border-yellow-200 bg-yellow-50/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-yellow-700">
              Falta pagar
            </CardTitle>
            <RefreshCw className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-yellow-700">
              {formatBRL(data.faltaPagar)}
            </p>
          </CardContent>
        </Card>

        {/* % Pago — progress ring */}
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              % Pago
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <div className="relative flex-shrink-0">
              <ProgressRing pct={pct} />
              <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-foreground">
                {pct}%
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-snug">
              {pct < 100 ? `${100 - pct}% pendente` : 'Tudo quitado!'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Secondary row: receitas, saldo, assinaturas ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

        {/* Receitas */}
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Receitas
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-green-600">
              {formatBRL(data.receitas)}
            </p>
          </CardContent>
        </Card>

        {/* Saldo */}
        <Card
          className={cn(
            'rounded-2xl shadow-sm',
            saldoPositive ? 'border-green-200' : 'border-red-200',
          )}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Saldo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={cn(
                'text-xl font-bold',
                saldoPositive ? 'text-green-600' : 'text-red-600',
              )}
            >
              {formatBRL(data.saldo)}
            </p>
          </CardContent>
        </Card>

        {/* Assinaturas de cartão — NOT included in totalDoMes */}
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Assinaturas de cartão
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-foreground">
              {formatBRL(data.assinaturasCartao)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Não incluso no total do mês
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
