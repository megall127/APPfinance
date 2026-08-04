import type { ReactNode } from 'react'
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Landmark,
  Pencil,
  Scale,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatBRL } from '@/lib/format'
import type { MovementKind } from './useReserves'

// ── Shared movement row ───────────────────────────────────────────────────────
//
// Serve à lista plana de MovementsTab (§6.8) e ao extrato de
// AccountStatementDialog (§6.6). Os dois payloads compartilham os campos
// abaixo, então a linha pede a menor forma comum e fica genérica no tipo
// concreto — assim `onEdit`/`onDelete` devolvem ao chamador o objeto DELE
// (com `accountId`, `yield`, etc.), sem cast.

export interface MovementRowData {
  id: string
  kind: MovementKind
  /** 'YYYY-MM-DD' */
  occurredOn: string
  /** derivado em JS → NÚMERO assinado (a UI nunca recalcula o sinal) */
  signedAmount: number
  description: string | null
  accountName?: string
  accountColor?: string | null
}

// ── Kind config ───────────────────────────────────────────────────────────────

interface KindStyle {
  label: string
  Icon: React.ComponentType<{ className?: string }>
  /** cor do ícone */
  iconClass: string
}

/** Ícone, rótulo e cor de cada tipo de movimento (§7.4). */
export const MOVEMENT_KIND_STYLE: Record<MovementKind, KindStyle> = {
  deposit: {
    label: 'Depósito',
    Icon: ArrowDownCircle,
    iconClass: 'text-primary-strong',
  },
  withdrawal: {
    label: 'Saque',
    Icon: ArrowUpCircle,
    iconClass: 'text-destructive',
  },
  yield: {
    label: 'Rendimento',
    Icon: Sparkles,
    iconClass: 'text-amber-500',
  },
  adjustment: {
    label: 'Ajuste',
    Icon: Scale,
    iconClass: 'text-muted-foreground',
  },
  opening: {
    label: 'Saldo inicial',
    Icon: Landmark,
    iconClass: 'text-muted-foreground',
  },
}

/**
 * 'YYYY-MM-DD' → '14/07/2026'.
 * Fatia a string em vez de passar por `new Date(iso)`, que interpreta a data
 * como UTC e volta um dia atrás em fuso negativo.
 */
export function formatOccurredOn(iso: string): string {
  const [year, month, day] = iso.split('-')
  if (!year || !month || !day) return iso
  return `${day}/${month}/${year}`
}

/** Só depósito e saque são editáveis/excluíveis (§6.10). */
function isEditable(kind: MovementKind): boolean {
  return kind === 'deposit' || kind === 'withdrawal'
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface MovementRowProps<T extends MovementRowData = MovementRowData> {
  movement: T
  /** Saldo corrente depois da linha — só o extrato (§6.6) tem esse número. */
  saldoApos?: number
  /** Linha extra abaixo da descrição (ex.: memória de cálculo do rendimento). */
  detail?: ReactNode
  /** Omitido ⇒ sem botão de editar (o extrato pode ser só leitura). */
  onEdit?: (movement: T) => void
  /** Omitido ⇒ sem botão de excluir. */
  onDelete?: (movement: T) => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MovementRow<T extends MovementRowData>({
  movement,
  saldoApos,
  detail,
  onEdit,
  onDelete,
}: MovementRowProps<T>) {
  const { label, Icon, iconClass } = MOVEMENT_KIND_STYLE[movement.kind]
  const positivo = movement.signedAmount > 0
  const negativo = movement.signedAmount < 0
  const editavel = isEditable(movement.kind)
  const mostrarAcoes = editavel && (onEdit || onDelete)

  return (
    <div className="flex items-center gap-3 py-3 px-4 rounded-lg hover:bg-muted/50 transition-colors group">
      {/* Ícone do tipo */}
      <Icon className={cn('h-5 w-5 shrink-0', iconClass)} aria-hidden="true" />

      {/* Tipo + descrição + data */}
      <div className="flex-1 min-w-0">
        <span className="font-medium text-sm text-foreground truncate block">
          {movement.description?.trim() ? movement.description : label}
        </span>
        <span className="text-xs text-muted-foreground">
          {formatOccurredOn(movement.occurredOn)}
          {movement.description?.trim() ? ` · ${label}` : ''}
        </span>
        {detail}
      </div>

      {/* Caixinha (só a lista plana embute o nome da conta) */}
      {movement.accountName && (
        <span
          className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full text-white shrink-0"
          style={{ backgroundColor: movement.accountColor ?? '#94a3b8' }}
        >
          {movement.accountName}
        </span>
      )}

      {/* Valor assinado + saldo corrente */}
      <div className="text-right shrink-0">
        <span
          className={cn(
            'text-sm font-medium tabular-nums block',
            positivo && 'text-primary-strong',
            negativo && 'text-destructive',
            !positivo && !negativo && 'text-foreground',
          )}
        >
          {positivo ? '+' : ''}
          {formatBRL(movement.signedAmount)}
        </span>
        {saldoApos !== undefined && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatBRL(saldoApos)}
          </span>
        )}
      </div>

      {/* Ações — só depósito e saque; rendimento muda reexecutando a apuração */}
      {mostrarAcoes && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {onEdit && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label="Editar"
              onClick={() => onEdit(movement)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          {onDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              aria-label="Excluir"
              onClick={() => onDelete(movement)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
