import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { LoaderCircle, Scale } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatBRL } from '@/lib/format'
import { parseAmountInput } from '@/features/lancamentos/math'
import { type ReserveAccount, useReconcileAccount } from './useReserves'

// ── Zod schema ────────────────────────────────────────────────────────────────

const reconcileSchema = z.object({
  balance: z.string().min(1, 'Informe o saldo do banco'),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida'),
  description: z.string().optional(),
})

type ReconcileFormData = z.infer<typeof reconcileSchema>

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Hoje em 'YYYY-MM-DD' montado com getFullYear/getMonth/getDate.
 * NUNCA `toISOString()`: ele converte para UTC e, em fuso negativo, devolve o
 * dia anterior depois das 21h — o ajuste cairia no dia (e no mês) errado.
 */
function todayISO(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ReconcileDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null enquanto nenhuma caixinha está selecionada. */
  account: ReserveAccount | null
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * "Acertar saldo com o banco" (§6.7).
 *
 * O usuário informa quanto a caixinha TEM de verdade; o app calcula o delta e
 * grava um movimento `adjustment`. É o único fluxo que cria ajustes, e a
 * diferença conta como RENDIMENTO — a divergência contra o extrato é,
 * esmagadoramente, rendimento real não modelado (dias úteis, aniversário da
 * aplicação). Contá-la como aporte inflaria "quanto eu coloquei".
 */
export function ReconcileDialog({
  open,
  onOpenChange,
  account,
}: ReconcileDialogProps) {
  const reconcile = useReconcileAccount()

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ReconcileFormData>({
    resolver: zodResolver(reconcileSchema),
    defaultValues: { balance: '', occurredOn: todayISO(), description: '' },
  })

  // Reset ao abrir ou ao trocar de caixinha.
  useEffect(() => {
    if (open) {
      reset({ balance: '', occurredOn: todayISO(), description: '' })
    }
  }, [open, account, reset])

  const saldoApp = account?.saldo ?? 0
  const balanceRaw = watch('balance') ?? ''
  const saldoBanco = balanceRaw.trim() ? parseAmountInput(balanceRaw) : null

  // `account.saldo` é o saldo de HOJE. A API calcula o ajuste contra o saldo na
  // data informada, então prever o número só é honesto quando a data é hoje —
  // com uma data anterior, um depósito posterior faria a prévia mostrar uma
  // diferença (e até um sinal) que não é a que será gravada.
  const dataEscolhida = watch('occurredOn')
  const naDataDeHoje = dataEscolhida === todayISO()
  const delta = saldoBanco != null && naDataDeHoje ? saldoBanco - saldoApp : null

  async function onSubmit(data: ReconcileFormData) {
    if (!account) return

    const parsed = parseAmountInput(data.balance)
    if (parsed === null) {
      toast.error('Saldo inválido. Use formato como 1234,56.')
      return
    }

    try {
      const result = await reconcile.mutateAsync({
        id: account.id,
        payload: {
          balance: parsed,
          occurredOn: data.occurredOn,
          description: data.description?.trim() || undefined,
        },
      })

      if (!result.adjusted) {
        toast.success('Saldo já estava certo — nada a ajustar.')
      } else {
        toast.success(
          `Ajuste de ${formatBRL(result.delta)} registrado como rendimento.`,
        )
      }
      onOpenChange(false)
    } catch {
      toast.error('Ocorreu um erro. Tente novamente.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Acertar saldo com o banco</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 pt-1">
          <p className="text-sm text-muted-foreground">
            Quanto tem hoje em{' '}
            <span className="font-semibold text-foreground">
              {account?.name}
            </span>
            , segundo o banco? A diferença entra como rendimento.
          </p>

          {/* Saldo do banco */}
          <div className="space-y-1.5">
            <Label htmlFor="reconcile-balance">Saldo no banco (R$) *</Label>
            <Input
              id="reconcile-balance"
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              aria-invalid={!!errors.balance}
              {...register('balance')}
            />
            {errors.balance?.message && (
              <p className="text-xs text-destructive">
                {errors.balance.message}
              </p>
            )}
          </div>

          {/* Comparativo ao vivo */}
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                Saldo no app {naDataDeHoje ? 'hoje' : 'na data escolhida'}
              </span>
              <span className="font-medium tabular-nums text-foreground">
                {naDataDeHoje ? formatBRL(saldoApp) : '—'}
              </span>
            </div>
            <div className="mt-1.5 flex items-center justify-between">
              <span className="text-muted-foreground">Diferença</span>
              {delta === null ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <span
                  className={cn(
                    'font-semibold tabular-nums',
                    delta > 0 && 'text-primary-strong',
                    delta < 0 && 'text-destructive',
                    delta === 0 && 'text-foreground',
                  )}
                >
                  {delta > 0 ? '+' : ''}
                  {formatBRL(delta)}
                </span>
              )}
            </div>
            <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
              <Scale className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {!naDataDeHoje
                ? 'A diferença será calculada sobre o saldo daquela data e registrada como rendimento.'
                : delta === null
                  ? 'Informe o saldo para ver a diferença.'
                  : delta === 0
                    ? 'Os dois batem — nada será registrado.'
                    : 'Vamos registrar essa diferença como rendimento na caixinha.'}
            </p>
          </div>

          {/* Data */}
          <div className="space-y-1.5">
            <Label htmlFor="reconcile-date">Data do saldo *</Label>
            <Input
              id="reconcile-date"
              type="date"
              aria-invalid={!!errors.occurredOn}
              {...register('occurredOn')}
            />
            {errors.occurredOn?.message && (
              <p className="text-xs text-destructive">
                {errors.occurredOn.message}
              </p>
            )}
          </div>

          {/* Observação */}
          <div className="space-y-1.5">
            <Label htmlFor="reconcile-description">Observação</Label>
            <Input
              id="reconcile-description"
              type="text"
              placeholder="Ex.: conferido no extrato do app do banco"
              {...register('description')}
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting || !account}>
              {isSubmitting && (
                <LoaderCircle className="mr-1 h-4 w-4 animate-spin" />
              )}
              Acertar saldo
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
