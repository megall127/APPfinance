import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { LoaderCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { formatBRL } from '@/lib/format'
import { parseAmountInput } from '@/features/lancamentos/math'
import {
  type Movement,
  useCreateMovement,
  useReserveAccounts,
  useUpdateMovement,
} from './useReserves'

// ── Zod schema ────────────────────────────────────────────────────────────────

const movementSchema = z.object({
  kind: z.enum(['deposit', 'withdrawal']),
  accountId: z.string().min(1, 'Escolha uma caixinha'),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida'),
  amount: z.string().min(1, 'Valor é obrigatório'),
  description: z.string().optional(),
})

type MovementFormData = z.infer<typeof movementSchema>

type MovementFormKind = MovementFormData['kind']

// ── Labels ────────────────────────────────────────────────────────────────────

const KIND_LABELS: Record<MovementFormKind, string> = {
  deposit: 'Depósito',
  withdrawal: 'Saque',
}

/** Nomes por extenso — `MONTHS_PT` de `@/lib/format` é abreviado (“Mar”). */
const MESES_PT = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
] as const

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Hoje em 'YYYY-MM-DD' montado com getFullYear/getMonth/getDate.
 * NUNCA `toISOString()`: ele converte para UTC e, em fuso negativo, devolve o
 * dia anterior depois das 21h — o movimento cairia no dia (e no mês) errado.
 */
function todayISO(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

/** 'YYYY-MM-DD' → 'março'; string vazia quando a data ainda está incompleta. */
function nomeDoMes(iso: string): string {
  const index = Number(iso.slice(5, 7)) - 1
  return MESES_PT[index] ?? ''
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface MovementFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Presente ⇒ edição (PATCH). A caixinha é imutável em §6.10. */
  movement?: Movement
  /** Pré-seleciona a caixinha ao criar (ex.: botão do card da conta). */
  defaultAccountId?: string
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MovementFormDialog({
  open,
  onOpenChange,
  movement,
  defaultAccountId,
}: MovementFormDialogProps) {
  const isEdit = !!movement
  const create = useCreateMovement()
  const update = useUpdateMovement()
  const { data: accounts } = useReserveAccounts()

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<MovementFormData>({
    resolver: zodResolver(movementSchema),
    defaultValues: {
      kind: 'deposit',
      accountId: '',
      occurredOn: todayISO(),
      amount: '',
      description: '',
    },
  })

  // Reset ao abrir ou ao trocar o alvo de edição
  useEffect(() => {
    if (open) {
      reset({
        kind: movement?.kind === 'withdrawal' ? 'withdrawal' : 'deposit',
        // Radix Select é baseado em string e os ids chegam como number em
        // runtime — coage sempre para casar com o value dos SelectItem.
        accountId: movement
          ? String(movement.accountId)
          : defaultAccountId
            ? String(defaultAccountId)
            : '',
        occurredOn: movement?.occurredOn ?? todayISO(),
        // A API devolve o valor ASSINADO ("-200.00"); o formulário trabalha
        // com módulo em formato BR, porque o payload vai positivo (§6.9).
        amount: movement
          ? Math.abs(movement.signedAmount).toFixed(2).replace('.', ',')
          : '',
        description: movement?.description ?? '',
      })
    }
  }, [open, movement, defaultAccountId, reset])

  const selectedKind = watch('kind')
  const selectedAccountId = watch('accountId')
  const occurredOn = watch('occurredOn') ?? ''
  const amountRaw = watch('amount') ?? ''

  // Contas ativas + a conta do movimento em edição (que pode estar arquivada)
  const activeAccounts = (accounts ?? []).filter(
    (acc) =>
      !acc.archived || (movement && String(acc.id) === String(movement.accountId)),
  )
  const selectedAccount = (accounts ?? []).find(
    (acc) => String(acc.id) === selectedAccountId,
  )

  // ── Aviso 1: o saque deixa a caixinha negativa ──
  // O saldo derivado já inclui o movimento em edição, então ele é retirado da
  // base antes de aplicar o valor novo — senão o aviso contaria duas vezes.
  const parsedAmount = parseAmountInput(amountRaw) ?? 0
  const saldoBase = selectedAccount
    ? selectedAccount.saldo -
      (movement && String(movement.accountId) === selectedAccountId
        ? movement.signedAmount
        : 0)
    : 0
  const saldoProjetado =
    saldoBase + (selectedKind === 'withdrawal' ? -parsedAmount : parsedAmount)
  const saldoNegativo =
    !!selectedAccount &&
    selectedKind === 'withdrawal' &&
    parsedAmount > 0 &&
    saldoProjetado < 0

  // ── Aviso 2: a data cai em mês já apurado ──
  const periodo = occurredOn.slice(0, 7)
  const mesFechado =
    !!selectedAccount?.lastClosedPeriod &&
    /^\d{4}-\d{2}$/.test(periodo) &&
    periodo <= selectedAccount.lastClosedPeriod

  async function onSubmit(data: MovementFormData) {
    const parsed = parseAmountInput(data.amount)
    if (parsed === null || parsed <= 0) {
      toast.error('Valor inválido. Use formato como 1234,56.')
      return
    }

    const description = data.description?.trim() ?? ''

    try {
      if (isEdit && movement) {
        // `accountId` é imutável (§6.10) e não entra no payload. A descrição
        // vai sempre, inclusive vazia, para que apagá-la funcione.
        const result = await update.mutateAsync({
          id: movement.id,
          payload: {
            kind: data.kind,
            occurredOn: data.occurredOn,
            amount: parsed,
            description,
          },
        })
        toast.success('Movimentação atualizada')
        if (result.recalcularSugerido) {
          toast.info(`Os rendimentos de ${nomeDoMes(data.occurredOn)} em diante serão recalculados.`)
        }
      } else {
        const result = await create.mutateAsync({
          accountId: data.accountId,
          kind: data.kind,
          occurredOn: data.occurredOn,
          amount: parsed,
          description: description || undefined,
        })
        toast.success(
          data.kind === 'deposit' ? 'Depósito registrado' : 'Saque registrado',
        )
        if (result.recalcularSugerido) {
          toast.info(`Os rendimentos de ${nomeDoMes(data.occurredOn)} em diante serão recalculados.`)
        }
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
          <DialogTitle>
            {isEdit ? 'Editar movimentação' : 'Nova movimentação'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 pt-1">
          {/* Tipo */}
          <div className="space-y-1.5">
            <Label htmlFor="movement-kind">Tipo *</Label>
            <Select
              value={selectedKind}
              onValueChange={(v) => setValue('kind', v as MovementFormKind)}
            >
              <SelectTrigger id="movement-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['deposit', 'withdrawal'] as MovementFormKind[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {KIND_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Caixinha */}
          <div className="space-y-1.5">
            <Label htmlFor="movement-account">Caixinha *</Label>
            <Select
              value={selectedAccountId}
              onValueChange={(v) => setValue('accountId', v)}
              disabled={isEdit}
            >
              <SelectTrigger id="movement-account" aria-invalid={!!errors.accountId}>
                <SelectValue placeholder="Escolha uma caixinha" />
              </SelectTrigger>
              <SelectContent>
                {activeAccounts.map((acc) => (
                  <SelectItem key={acc.id} value={String(acc.id)}>
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: acc.color ?? '#94a3b8' }}
                      />
                      {acc.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isEdit ? (
              <p className="text-xs text-muted-foreground">
                A caixinha de uma movimentação não pode ser trocada.
              </p>
            ) : (
              selectedAccount && (
                <p className="text-xs text-muted-foreground">
                  Saldo hoje: {formatBRL(selectedAccount.saldo)}
                </p>
              )
            )}
            {errors.accountId?.message && (
              <p className="text-xs text-destructive">
                {errors.accountId.message}
              </p>
            )}
          </div>

          {/* Data */}
          <div className="space-y-1.5">
            <Label htmlFor="movement-date">Data *</Label>
            <Input
              id="movement-date"
              type="date"
              aria-invalid={!!errors.occurredOn}
              {...register('occurredOn')}
            />
            <p className="text-xs text-muted-foreground">
              O dinheiro rende a partir do dia em que entra.
            </p>
            {mesFechado && (
              <p className="text-xs text-muted-foreground">
                Isso vai atualizar os rendimentos de {nomeDoMes(occurredOn)} em
                diante.
              </p>
            )}
            {errors.occurredOn?.message && (
              <p className="text-xs text-destructive">
                {errors.occurredOn.message}
              </p>
            )}
          </div>

          {/* Valor */}
          <div className="space-y-1.5">
            <Label htmlFor="movement-amount">Valor (R$) *</Label>
            <Input
              id="movement-amount"
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              aria-invalid={!!errors.amount}
              {...register('amount')}
            />
            {saldoNegativo && (
              <p className="text-xs text-destructive">
                Este saque deixa a caixinha com saldo negativo (
                {formatBRL(saldoProjetado)}).
              </p>
            )}
            {errors.amount?.message && (
              <p className="text-xs text-destructive">{errors.amount.message}</p>
            )}
          </div>

          {/* Descrição */}
          <div className="space-y-1.5">
            <Label htmlFor="movement-description">Descrição</Label>
            <Input
              id="movement-description"
              placeholder="Ex.: Aporte do mês"
              maxLength={180}
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
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && (
                <LoaderCircle className="h-4 w-4 animate-spin mr-1" />
              )}
              {saldoNegativo
                ? 'Registrar mesmo assim'
                : isEdit
                  ? 'Salvar'
                  : 'Registrar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
