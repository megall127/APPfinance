import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatBRL } from '@/lib/format'
import { ShieldCheck, Clock, ShoppingBag } from 'lucide-react'
import { ProgressRing } from '../ProgressRing'
import type { DashboardData } from '../useDashboard'

interface ResumoPanelProps {
  data: DashboardData | undefined
  isLoading: boolean
}

export function ResumoPanel({ data, isLoading }: ResumoPanelProps) {
  if (isLoading) {
    return (
      <Card className="h-full rounded-2xl p-6 shadow-sm">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-4 h-10 w-48" />
        <div className="mt-6 flex gap-4">
          <Skeleton className="h-16 flex-1" />
          <Skeleton className="h-16 flex-1" />
        </div>
      </Card>
    )
  }
  if (!data) return null

  const pct = Math.round(data.percentualPago * 100)

  return (
    <Card className="flex h-full flex-col justify-center rounded-2xl p-6 shadow-sm">
      <p className="text-sm font-medium text-muted-foreground">Total do mês</p>
      <p className="mt-1 text-4xl font-bold tracking-tight text-foreground tabular-nums">
        {formatBRL(data.totalDoMes)}
      </p>

      <div className="mt-6 flex items-center gap-6">
        <div className="relative flex-shrink-0">
          <ProgressRing pct={pct} />
          <span className="absolute inset-0 flex items-center justify-center text-base font-bold text-foreground">
            {pct}%
          </span>
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 shrink-0 text-primary-strong" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Já pago</p>
              <p className="truncate text-lg font-semibold text-foreground tabular-nums">
                {formatBRL(data.jaPago)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 shrink-0 text-secondary" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Falta pagar</p>
              <p className="truncate text-lg font-semibold text-foreground tabular-nums">
                {formatBRL(data.faltaPagar)}
              </p>
            </div>
          </div>

          {/* Sem esta linha o total do topo não fecha com as contas de baixo:
              o gasto avulso está no total mas fora de pago/falta de propósito. */}
          {data.gastosVariaveis > 0 && (
            <div className="flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Gastos avulsos</p>
                <p className="truncate text-lg font-semibold text-foreground tabular-nums">
                  {formatBRL(data.gastosVariaveis)}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
