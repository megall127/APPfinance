import { Progress } from '@/components/ui/progress'
import { formatBRL } from '@/lib/format'
import { cn } from '@/lib/utils'

// ── Barra de meta ─────────────────────────────────────────────────────────────
//
// §7.4: recebe a FRAÇÃO 0..1 que a API devolve (`metaProgresso`, mesma
// convenção de `percentualPago` do dashboard) e mostra o percentual INTEIRO.
// O `<Progress>` do repo espera 0..100 — esquecer o × 100 já mordeu no
// ResumoPanel, então a conversão mora aqui e em nenhum outro lugar.

interface GoalProgressBarProps {
  /** fração 0..1 (0.4288 → 43%); null quando a conta não tem meta */
  progresso: number | null
  /** valor da meta em reais → NÚMERO; opcional */
  metaTotal?: number | null
  /** quanto ainda falta em reais → NÚMERO; opcional */
  faltam?: number | null
  /** meses até a meta; null quando inalcançável no ritmo atual */
  etaMeses?: number | null
  className?: string
}

/** "11" → "11 meses"; "1" → "1 mês". */
function mesesLabel(meses: number): string {
  return meses === 1 ? '1 mês' : `${meses} meses`
}

export function GoalProgressBar({
  progresso,
  metaTotal,
  faltam,
  etaMeses,
  className,
}: GoalProgressBarProps) {
  const fracao =
    progresso != null && Number.isFinite(progresso) ? Math.max(0, progresso) : 0
  const pct = Math.round(fracao * 100)
  const atingida = pct >= 100

  const partes: string[] = []
  if (faltam != null && faltam > 0) partes.push(`Faltam ${formatBRL(faltam)}`)
  if (etaMeses != null) {
    partes.push(
      etaMeses <= 0
        ? 'chega na meta ainda este mês'
        : `chega na meta em ${mesesLabel(etaMeses)}`,
    )
  }

  const legenda = atingida
    ? 'Meta atingida'
    : partes.length > 0
      ? partes.join(' · ')
      : 'Sem previsão de conclusão no ritmo atual'

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">
          {metaTotal != null ? `Meta de ${formatBRL(metaTotal)}` : 'Meta'}
        </span>
        <span className="font-medium text-foreground tabular-nums">{pct}%</span>
      </div>

      <Progress value={Math.min(100, pct)} className="h-2" />

      <p
        className={cn(
          'text-[11px]',
          atingida ? 'text-primary-strong' : 'text-muted-foreground',
        )}
      >
        {legenda}
      </p>
    </div>
  )
}
