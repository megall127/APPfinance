import { Lock } from 'lucide-react'
import { formatBRL } from '@/lib/format'

interface LockedAmountProps {
  /** Valor do lançamento (string decimal), ou null quando o mês não tem gastos. */
  amount: string | null
}

/**
 * Valor somente-leitura da linha automática.
 * O cadeado é a consequência visual da trava — a defesa de verdade é o 422 da API.
 */
export function LockedAmount({ amount }: LockedAmountProps) {
  return (
    <span
      title="Calculado pela aba Gastos"
      className="inline-flex items-center justify-end gap-1.5 text-sm tabular-nums text-muted-foreground"
    >
      <Lock className="h-3 w-3 shrink-0" />
      {amount !== null ? formatBRL(Number(amount)) : '—'}
    </span>
  )
}
