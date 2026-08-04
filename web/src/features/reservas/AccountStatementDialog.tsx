import { useMemo } from 'react'
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Landmark,
  Pencil,
  Scale,
  Sparkles,
  Trash2,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatBRL, formatPercentBR, MONTHS_PT } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  type MovementKind,
  type MovementYieldDetail,
  type ReserveAccount,
  type StatementMovement,
  useReserveStatement,
} from './useReserves'

/**
 * Extrato de uma caixinha (§7.4) — saldo corrente linha a linha, agrupado por
 * mês, com a MEMÓRIA DE CÁLCULO de cada linha de rendimento.
 *
 * A UI nunca recalcula dinheiro: `signedAmount` e `saldoApos` já vêm prontos
 * da API (§6.6). O único cálculo local é o de APRESENTAÇÃO da memória, e ele
 * usa exclusivamente os campos congelados em `movement.yield`.
 */

// ── Formatters ────────────────────────────────────────────────────────────────

/**
 * A base do rendimento é `decimal(14,6)` e é mostrada com as SEIS casas: é ela
 * que explica por que o valor creditado não bate com "saldo × taxa" na conta de
 * cabeça (a base é ponderada pelo dia de cada movimento).
 */
const baseFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 6,
  maximumFractionDigits: 6,
})

/** "12285.056667" → "R$ 12.285,056667" (NBSP normalizado como em formatBRL). */
function formatBase(value: string): string {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return value
  return baseFormatter.format(parsed).replace(/[\u00A0\u202F]/g, ' ')
}

/** Taxa configurada sem zeros inúteis: "102.000000" → "102". */
const rateValueFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 6,
})

function formatRateValue(value: string): string {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? rateValueFormatter.format(parsed) : value
}

/**
 * A origem da taxa entre parênteses:
 *   cdi     → "102% do CDI de 14,90% a.a."
 *   monthly → "0,85% a.m."
 *   yearly  → "12,5% a.a."
 */
function formatRateOrigin(detail: MovementYieldDetail): string {
  const value = formatRateValue(detail.rateSource)
  if (detail.rateKind === 'monthly') return `${value}% a.m.`
  if (detail.rateKind === 'yearly') return `${value}% a.a.`
  const cdi = Number(detail.cdiAnnual)
  if (detail.cdiAnnual == null || !Number.isFinite(cdi)) return `${value}% do CDI`
  return `${value}% do CDI de ${formatPercentBR(cdi / 100, 2)} a.a.`
}

/**
 * Memória de cálculo completa da linha (§7.4):
 * "R$ 12.285,056667 × 1,187572% (102% do CDI de 14,90% a.a.)"
 */
export function formatYieldMemo(detail: MovementYieldDetail): string {
  const applied = Number(detail.rateApplied)
  const rate = Number.isFinite(applied)
    ? formatPercentBR(applied, 6)
    : detail.rateApplied
  return `${formatBase(detail.base)} × ${rate} (${formatRateOrigin(detail)})`
}

/** '2026-07-05' → '05/07'. Sem `new Date`: a string já é a data local. */
function formatDay(occurredOn: string): string {
  return `${occurredOn.slice(8, 10)}/${occurredOn.slice(5, 7)}`
}

/** '2026-07-05' → 'Jul de 2026' (cabeçalho do grupo). */
function formatMonthHeader(occurredOn: string): string {
  const month = Number(occurredOn.slice(5, 7))
  return `${MONTHS_PT[month - 1] ?? occurredOn.slice(5, 7)} de ${occurredOn.slice(0, 4)}`
}

/** '2026-07-05' → '05/07/2026' (intervalo do extrato). */
function formatFullDate(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`
}

// ── Kind metadata ─────────────────────────────────────────────────────────────

interface KindMeta {
  Icon: typeof ArrowDownCircle
  iconClass: string
  label: string
}

const KIND_META: Record<MovementKind, KindMeta> = {
  opening: {
    Icon: Landmark,
    iconClass: 'text-muted-foreground',
    label: 'Saldo inicial',
  },
  deposit: {
    Icon: ArrowDownCircle,
    iconClass: 'text-primary-strong',
    label: 'Depósito',
  },
  withdrawal: {
    Icon: ArrowUpCircle,
    iconClass: 'text-destructive',
    label: 'Saque',
  },
  adjustment: {
    Icon: Scale,
    iconClass: 'text-muted-foreground',
    label: 'Acerto com o banco',
  },
  yield: {
    Icon: Sparkles,
    iconClass: 'text-amber-500',
    label: 'Rendimento',
  },
}

// ── Grouping ──────────────────────────────────────────────────────────────────

interface MonthGroup {
  /** 'YYYY-MM' */
  key: string
  label: string
  movements: StatementMovement[]
}

/** Agrupa por mês PRESERVANDO a ordem em que a API devolveu as linhas. */
function groupByMonth(movements: StatementMovement[]): MonthGroup[] {
  const groups: MonthGroup[] = []
  for (const movement of movements) {
    const key = movement.occurredOn.slice(0, 7)
    const last = groups[groups.length - 1]
    if (last && last.key === key) {
      last.movements.push(movement)
      continue
    }
    groups.push({
      key,
      label: formatMonthHeader(movement.occurredOn),
      movements: [movement],
    })
  }
  return groups
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface AccountStatementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null enquanto nenhuma caixinha foi escolhida — a query fica desabilitada. */
  account: ReserveAccount | null
  /** Opcional: sem ele a linha não mostra o lápis (rendimento nunca mostra). */
  onEdit?: (movement: StatementMovement) => void
  /** Opcional: sem ele a linha não mostra a lixeira (rendimento nunca mostra). */
  onDelete?: (movement: StatementMovement) => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AccountStatementDialog({
  open,
  onOpenChange,
  account,
  onEdit,
  onDelete,
}: AccountStatementDialogProps) {
  const { data, isLoading, isError } = useReserveStatement(
    open && account ? account.id : null,
  )

  const groups = useMemo(
    () => groupByMonth(data?.movements ?? []),
    [data?.movements],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Extrato {account ? `· ${account.name}` : ''}</DialogTitle>
          <DialogDescription>
            {data
              ? `De ${formatFullDate(data.from)} a ${formatFullDate(data.to)} · começou com ${formatBRL(data.saldoInicial)} e terminou com ${formatBRL(data.saldoFinal)}`
              : 'Tudo o que entrou, saiu e rendeu nesta caixinha.'}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[65vh] overflow-y-auto pr-1">
          {isLoading && <StatementSkeleton />}

          {!isLoading && isError && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Não foi possível carregar o extrato. Tente novamente.
            </p>
          )}

          {!isLoading && !isError && groups.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma movimentação neste período.
            </p>
          )}

          {!isLoading && !isError && groups.length > 0 && (
            <div className="space-y-4">
              {groups.map((group) => (
                <section key={group.key}>
                  <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {group.label}
                  </h3>
                  <ul className="divide-y divide-border">
                    {group.movements.map((movement) => (
                      <MovementLine
                        key={movement.id}
                        movement={movement}
                        onEdit={onEdit}
                        onDelete={onDelete}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Row ───────────────────────────────────────────────────────────────────────

interface MovementLineProps {
  movement: StatementMovement
  onEdit?: (movement: StatementMovement) => void
  onDelete?: (movement: StatementMovement) => void
}

function MovementLine({ movement, onEdit, onDelete }: MovementLineProps) {
  const meta = KIND_META[movement.kind] ?? KIND_META.adjustment
  const { Icon } = meta
  const positive = movement.signedAmount > 0
  const negative = movement.signedAmount < 0

  // Intl já escreve o "-"; o "+" é nosso, para o sinal ser explícito nos dois lados.
  const amountLabel = `${positive ? '+' : ''}${formatBRL(movement.signedAmount)}`

  const detail = movement.kind === 'yield' ? movement.yield : null
  // `cdiSource` é null fora de "% do CDI" — sem CDI envolvido não há o que estimar.
  const cdiEstimado = detail?.cdiSource != null && detail.cdiSource !== 'exact'

  // Rendimento NÃO é editável (§6.6 `editavel: false`): mexer nele é papel do
  // recálculo, não do usuário.
  const showActions = movement.editavel && (onEdit != null || onDelete != null)

  return (
    <li className="flex items-start gap-3 py-2">
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', meta.iconClass)} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {movement.description || meta.label}
          </span>
          {cdiEstimado && (
            <Badge
              variant="outline"
              className="px-1.5 py-0 text-[10px] font-normal text-muted-foreground"
              title="Usamos o CDI mais recente que você informou"
            >
              CDI estimado
            </Badge>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          <span className="tabular-nums">{formatDay(movement.occurredOn)}</span>
          {movement.description ? ` · ${meta.label}` : ''}
        </p>

        {detail && (
          <p className="text-[11px] text-muted-foreground">
            {formatYieldMemo(detail)}
          </p>
        )}
      </div>

      <div className="shrink-0 text-right">
        <p
          className={cn(
            'text-sm font-semibold tabular-nums',
            positive && 'text-primary-strong',
            negative && 'text-destructive',
          )}
        >
          {amountLabel}
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {formatBRL(movement.saldoApos)}
        </p>
      </div>

      {showActions && (
        <div className="flex shrink-0 items-center gap-1">
          {onEdit && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Editar movimentação"
              onClick={() => onEdit(movement)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          {onDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive"
              aria-label="Excluir movimentação"
              onClick={() => onDelete(movement)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}
    </li>
  )
}

// ── Skeleton loader ───────────────────────────────────────────────────────────

function StatementSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-3 w-24" />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-4 w-4 rounded-full" />
          <Skeleton className="h-4 flex-1 max-w-[220px]" />
          <Skeleton className="ml-auto h-4 w-20" />
        </div>
      ))}
    </div>
  )
}
