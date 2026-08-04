import { Link } from 'react-router-dom'
import { PiggyBank, TrendingUp, WifiOff } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatBRL, MONTHS_PT } from '@/lib/format'
import type { ReserveSummary } from '@/features/reservas/useReserves'
import { ProgressRing } from '../ProgressRing'

interface GuardadoPanelProps {
  data: ReserveSummary | undefined
  isLoading: boolean
  /** Sem isto, uma falha de rede seria lida como "você não tem caixinha nenhuma". */
  isError?: boolean
}

/** true quando o período do painel é o mês em que estamos agora. */
function ehMesCorrente(data: ReserveSummary): boolean {
  const hoje = new Date()
  return data.year === hoje.getFullYear() && data.month === hoje.getMonth() + 1
}

export function GuardadoPanel({ data, isLoading, isError }: GuardadoPanelProps) {
  if (isLoading) {
    return (
      <Card className="h-full rounded-2xl p-6 shadow-sm">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="mt-4 h-8 w-40" />
        <div className="mt-6 flex gap-4">
          <Skeleton className="h-24 w-24 rounded-full" />
          <Skeleton className="h-16 flex-1" />
        </div>
      </Card>
    )
  }

  // Falha de rede NÃO é "não tem caixinha": convidar a família que já guardou
  // R$ 12 mil a "criar a primeira" faz ela achar que perdeu tudo.
  if (isError || (!data && !isLoading)) {
    return (
      <Card className="flex h-full flex-col items-center justify-center rounded-2xl p-6 text-center shadow-sm">
        <WifiOff className="h-8 w-8 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium text-foreground">
          Não deu para carregar suas reservas
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Verifique a conexão e puxe a tela para baixo para tentar de novo.
        </p>
      </Card>
    )
  }

  // ⚠️ NUNCA `return null` aqui: um painel nulo continua ocupando um
  // CarouselItem E um dot, deixando um slide em branco no mobile.
  if (!data || data.contasAtivas === 0) {
    return (
      <Card className="flex h-full flex-col items-center justify-center rounded-2xl p-6 text-center shadow-sm">
        <PiggyBank className="h-8 w-8 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium text-foreground">
          Nenhuma caixinha ainda
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Cadastre onde você guarda dinheiro para acompanhar o rendimento.
        </p>
        <Link
          to="/reservas"
          className="mt-4 text-sm font-medium text-primary-strong hover:underline"
        >
          Criar a primeira
        </Link>
      </Card>
    )
  }

  // `metaProgresso` é FRAÇÃO 0..1 (como `percentualPago`); o anel espera 0..100.
  const pct = Math.round((data.metaProgresso ?? 0) * 100)
  const temMeta = data.metaProgresso !== null

  // O período vem do MonthYearPicker e pode ser qualquer mês. Só o mês corrente
  // tem rendimento "parcial · até hoje"; um mês fechado já rendeu tudo que ia
  // render, e o valor dele é o último ponto da série de 12 meses.
  const corrente = ehMesCorrente(data)
  const doPeriodo = (data.evolucao12m ?? []).find(
    (p) => p.year === data.year && p.month === data.month,
  )
  const rendimentoLabel = corrente
    ? `Rendeu ${formatBRL(data.rendimentoParcialDoMes)} este mês`
    : `Rendeu ${formatBRL(doPeriodo?.rendimento ?? 0)} em ${MONTHS_PT[data.month - 1] ?? ''}`

  return (
    <Card className="flex h-full flex-col justify-center rounded-2xl p-6 shadow-sm">
      <p className="text-sm font-medium text-muted-foreground">Guardado</p>
      <p className="mt-1 truncate text-2xl font-semibold tabular-nums text-foreground">
        {formatBRL(data.totalGuardado)}
      </p>

      <div className="mt-6 flex items-center gap-6">
        {temMeta && (
          <div className="relative shrink-0">
            <ProgressRing pct={pct} />
            <span className="absolute inset-0 flex items-center justify-center text-base font-bold text-foreground">
              {pct}%
            </span>
          </div>
        )}

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 shrink-0 text-primary-strong" />
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold tabular-nums text-primary-strong">
                {rendimentoLabel}
              </p>
              {corrente && (
                <p className="text-[11px] text-muted-foreground">
                  parcial · até hoje
                </p>
              )}
            </div>
          </div>

          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              {temMeta ? 'Meta' : 'Rendimento no ano'}
            </p>
            <p className="truncate text-sm font-medium tabular-nums text-foreground">
              {temMeta
                ? formatBRL(data.metaTotal ?? 0)
                : formatBRL(data.rendimentoNoAno)}
            </p>
          </div>
        </div>
      </div>
    </Card>
  )
}
