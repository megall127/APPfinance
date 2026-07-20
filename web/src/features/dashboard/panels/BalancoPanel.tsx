import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatBRL } from '@/lib/format'
import { cn } from '@/lib/utils'
import { TrendingUp, Wallet, CreditCard } from 'lucide-react'
import type { DashboardData } from '../useDashboard'

interface BalancoPanelProps {
  data: DashboardData | undefined
  isLoading: boolean
}

export function BalancoPanel({ data, isLoading }: BalancoPanelProps) {
  if (isLoading) {
    return (
      <Card className="h-full rounded-2xl p-6 shadow-sm">
        <Skeleton className="h-4 w-24" />
        <div className="mt-6 space-y-5">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </Card>
    )
  }
  if (!data) return null

  const saldoPositive = data.saldo >= 0

  return (
    <Card className="flex h-full flex-col justify-center rounded-2xl p-6 shadow-sm">
      <p className="text-sm font-medium text-muted-foreground">Balanço do mês</p>

      <div className="mt-5 space-y-5">
        {/* Receitas */}
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <TrendingUp className="h-4 w-4 text-primary-strong" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">Receitas</p>
            <p className="truncate text-lg font-semibold text-foreground tabular-nums">
              {formatBRL(data.receitas)}
            </p>
          </div>
        </div>

        {/* Saldo */}
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
              saldoPositive ? 'bg-primary/10' : 'bg-destructive/10',
            )}
          >
            <Wallet
              className={cn('h-4 w-4', saldoPositive ? 'text-primary-strong' : 'text-destructive')}
            />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">Saldo</p>
            <p
              className={cn(
                'truncate text-lg font-semibold tabular-nums',
                saldoPositive ? 'text-primary-strong' : 'text-destructive',
              )}
            >
              {formatBRL(data.saldo)}
            </p>
          </div>
        </div>

        {/* Assinaturas de cartão */}
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">Assinaturas de cartão</p>
            <p className="truncate text-lg font-semibold text-foreground tabular-nums">
              {formatBRL(data.assinaturasCartao)}
            </p>
            <p className="text-[11px] text-muted-foreground">Não incluso no total do mês</p>
          </div>
        </div>
      </div>
    </Card>
  )
}
