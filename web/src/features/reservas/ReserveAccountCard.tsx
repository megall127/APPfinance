import {
  ArrowDownUp,
  Pencil,
  Scale,
  ScrollText,
  TrendingUp,
  Trash2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatBRL } from '@/lib/format'
import { GoalProgressBar } from './GoalProgressBar'
import type { ReserveAccount } from './useReserves'

// ── Card de uma caixinha ──────────────────────────────────────────────────────
//
// `rateLabel` já vem formatado pela API ("102% do CDI · ≈1,19% a.m.") — a UI
// não remonta a frase. Dinheiro agregado (`saldo`, `rendimentoParcialDoMes`)
// é NÚMERO (§1.3); `goalAmount` é STRING de coluna decimal e por isso a meta
// usa `metaProgresso`/`metaFaltam`, que já vêm agregados.

interface ReserveAccountCardProps {
  account: ReserveAccount
  onEdit: (account: ReserveAccount) => void
  onDelete: (account: ReserveAccount) => void
  onMovement: (account: ReserveAccount) => void
  onStatement: (account: ReserveAccount) => void
  onReconcile: (account: ReserveAccount) => void
}

export function ReserveAccountCard({
  account,
  onEdit,
  onDelete,
  onMovement,
  onStatement,
  onReconcile,
}: ReserveAccountCardProps) {
  const color = account.color ?? '#4CAF82'
  const isArchived = Boolean(account.archived)

  return (
    <Card className="rounded-2xl p-5 shadow-sm">
      {/* ── Identificação ── */}
      <div className="flex items-start gap-3">
        <span
          className="mt-1 inline-block h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-base font-semibold text-foreground">
              {account.name}
            </h2>
            {isArchived && (
              <Badge variant="secondary" className="font-normal">
                Arquivada
              </Badge>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {account.institution
              ? `${account.institution} · ${account.rateLabel}`
              : account.rateLabel}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Editar caixinha"
            onClick={() => onEdit(account)}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            aria-label="Excluir caixinha"
            onClick={() => onDelete(account)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* ── Saldo + rendimento parcial ── */}
      <p className="mt-4 truncate text-2xl font-semibold text-foreground tabular-nums">
        {formatBRL(account.saldo)}
      </p>
      <div className="mt-1 flex items-center gap-2">
        <TrendingUp className="h-3.5 w-3.5 shrink-0 text-primary-strong" />
        <p className="text-sm font-medium text-primary-strong tabular-nums">
          {formatBRL(account.rendimentoParcialDoMes)} este mês
        </p>
        <span className="text-[11px] text-muted-foreground">
          parcial · até hoje
        </span>
      </div>

      {/* ── Meta ── */}
      {account.metaProgresso !== null && (
        <GoalProgressBar
          className="mt-4"
          progresso={account.metaProgresso}
          metaTotal={
            account.goalAmount !== null ? Number(account.goalAmount) : null
          }
          faltam={account.metaFaltam}
          etaMeses={account.metaEtaMeses}
        />
      )}

      {/* ── Ações ── */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => onMovement(account)}
        >
          <ArrowDownUp className="h-3.5 w-3.5" />
          Movimentar
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => onStatement(account)}
        >
          <ScrollText className="h-3.5 w-3.5" />
          Extrato
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          onClick={() => onReconcile(account)}
        >
          <Scale className="h-3.5 w-3.5" />
          Acertar saldo
        </Button>
      </div>
    </Card>
  )
}
