import { Percent, TrendingUp } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatBRL, formatPercentBR } from '@/lib/format'
import { GoalProgressBar } from './GoalProgressBar'
import type { CdiCurrent, ReserveSummary } from './useReserves'

// ── Cabeçalho consolidado ─────────────────────────────────────────────────────
//
// §7.4: consolidado grande + rendimento PARCIAL do mês + chip do CDI.
// Todo o dinheiro daqui é agregado em JS → NÚMERO (§1.3), então vai direto
// para o `formatBRL` sem `Number(...)`.

interface TotalGuardadoHeaderProps {
  summary: ReserveSummary | undefined
  isLoading: boolean
  isError?: boolean
  /** CDI vigente hoje; undefined enquanto carrega ou quando a query falhou */
  cdi?: CdiCurrent
  onOpenCdi: () => void
}

/** Um número secundário do rodapé do cabeçalho. */
function Stat({
  label,
  value,
  hint,
  strong,
}: {
  label: string
  value: string
  hint?: string
  strong?: boolean
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={
          strong
            ? 'truncate text-base font-semibold text-primary-strong tabular-nums'
            : 'truncate text-base font-semibold text-foreground tabular-nums'
        }
      >
        {value}
      </p>
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

export function TotalGuardadoHeader({
  summary,
  isLoading,
  isError,
  cdi,
  onOpenCdi,
}: TotalGuardadoHeaderProps) {
  if (isLoading) {
    return (
      <Card className="rounded-2xl p-6 shadow-sm">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-3 h-9 w-56" />
        <Skeleton className="mt-4 h-4 w-48" />
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </Card>
    )
  }

  if (isError) {
    return (
      <Card className="rounded-2xl p-6 shadow-sm">
        <p className="text-sm text-destructive">
          Erro ao carregar o consolidado das reservas. Tente novamente.
        </p>
      </Card>
    )
  }

  const totalGuardado = summary?.totalGuardado ?? 0
  const parcial = summary?.rendimentoParcialDoMes ?? 0
  const previsto = summary?.rendimentoPrevistoDoMes ?? 0
  const contasAtivas = summary?.contasAtivas ?? 0

  return (
    <Card className="rounded-2xl p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">
            Total guardado
          </p>
          <p className="mt-1 truncate text-3xl font-semibold text-foreground tabular-nums">
            {formatBRL(totalGuardado)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {contasAtivas === 1
              ? '1 caixinha ativa'
              : `${contasAtivas} caixinhas ativas`}
          </p>
        </div>

        {/* Chip do CDI — abre o diálogo de taxa */}
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 sm:self-start"
          onClick={onOpenCdi}
        >
          <Percent className="h-3.5 w-3.5" />
          {cdi
            ? `CDI ${formatPercentBR(cdi.annualRate / 100, 2)} a.a.`
            : 'CDI'}
          {cdi && cdi.source !== 'exact' ? (
            <Badge variant="secondary" className="ml-1 font-normal">
              estimado
            </Badge>
          ) : null}
        </Button>
      </div>

      {/* Rendimento parcial do mês (§5.6 — sempre rotulado como parcial) */}
      <div className="mt-4 flex items-center gap-2">
        <TrendingUp className="h-4 w-4 shrink-0 text-primary-strong" />
        <p className="text-sm font-medium text-primary-strong tabular-nums">
          Rendeu {formatBRL(parcial)} este mês
        </p>
        <span className="text-[11px] text-muted-foreground">
          parcial · até hoje
        </span>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Principal" value={formatBRL(summary?.totalPrincipal ?? 0)} />
        <Stat
          label="Rendimento acumulado"
          value={formatBRL(summary?.totalRendimento ?? 0)}
          strong
        />
        <Stat
          label="Previsto no mês"
          value={formatBRL(previsto)}
          hint="se nada mudar até o fim do mês"
        />
        <Stat
          label="Rendimento no ano"
          value={formatBRL(summary?.rendimentoNoAno ?? 0)}
        />
      </div>

      {summary && summary.metaProgresso !== null ? (
        <GoalProgressBar
          className="mt-6"
          progresso={summary.metaProgresso}
          metaTotal={summary.metaTotal}
          // Sem `faltam`, a barra cairia no texto "Sem previsão de conclusão no
          // ritmo atual" — lido como "você nunca chega lá" logo acima de cards
          // que dizem "faltam R$ X · chega na meta em 11 meses". `etaMeses` fica
          // de fora de propósito: a previsão consolidada dependeria do aporte
          // planejado de VÁRIAS caixinhas com taxas diferentes, e a da caixinha
          // é a que o usuário consegue conferir.
          faltam={
            summary.metaTotal !== null
              ? Math.max(0, summary.metaTotal - summary.totalGuardado)
              : null
          }
        />
      ) : null}
    </Card>
  )
}
