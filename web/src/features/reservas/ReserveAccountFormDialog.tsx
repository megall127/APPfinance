import { useEffect, useMemo } from 'react'
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
import { formatBRL, formatPercentBR, formatRateLabel } from '@/lib/format'
import { parseAmountInput } from '@/features/lancamentos/math'
import { annualEquivalent, effectiveMonthlyRate } from './interest'
import {
  type CreateReserveAccountPayload,
  type RateKind,
  type ReserveAccount,
  type UpdateReserveAccountPayload,
  useCdi,
  useCreateReserveAccount,
  useUpdateReserveAccount,
} from './useReserves'

// ── Zod schema ────────────────────────────────────────────────────────────────

const accountSchema = z
  .object({
    name: z.string().min(1, 'Nome é obrigatório'),
    institution: z.string().optional(),
    openedAt: z.string().min(1, 'Data de abertura é obrigatória'),
    saldoInicial: z.string().optional(),
    rateKind: z.enum(['monthly', 'yearly', 'cdi']),
    rateValue: z.string().min(1, 'Taxa é obrigatória'),
    goalAmount: z.string().optional(),
    goalDate: z.string().optional(),
    goalMonthlyContribution: z.string().optional(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida')
      .optional(),
  })
  .refine(
    (data) => {
      const parsed = parseAmountInput(data.rateValue)
      return parsed !== null && parsed > 0
    },
    { message: 'Taxa inválida. Use um número como 0,85 ou 102.', path: ['rateValue'] }
  )

type ReserveAccountFormData = z.infer<typeof accountSchema>

// ── Rate kind labels ──────────────────────────────────────────────────────────

const RATE_KIND_LABELS: Record<RateKind, string> = {
  monthly: '% ao mês',
  yearly: '% ao ano',
  cdi: '% do CDI',
}

/** Suffix shown inside the rate field, right after the number the user types. */
const RATE_KIND_SUFFIX: Record<RateKind, string> = {
  monthly: '% a.m.',
  yearly: '% a.a.',
  cdi: '% do CDI',
}

const RATE_KIND_PLACEHOLDER: Record<RateKind, string> = {
  monthly: 'Ex.: 0,85',
  yearly: 'Ex.: 12,5',
  cdi: 'Ex.: 102',
}

/** Reference amount of the third reading of the live preview (§7.4). */
const PREVIEW_BASE = 10000

const DEFAULT_COLOR = '#4CAF82'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Today as 'YYYY-MM-DD' in LOCAL time — never `toISOString()` (§7.4). */
function todayISO(): string {
  const now = new Date()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${mm}-${dd}`
}

/** decimal string of money ("30000.00") → BR input format ("30000,00"). */
function moneyToInput(value: string | null | undefined): string {
  if (!value) return ''
  return Number(value).toFixed(2).replace('.', ',')
}

/** decimal string of a rate ("102.000000") → BR input format ("102"). */
function rateToInput(value: string | null | undefined): string {
  if (!value) return ''
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return ''
  return String(parsed).replace('.', ',')
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ReserveAccountFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Ausente = criar uma caixinha nova. */
  account?: ReserveAccount
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ReserveAccountFormDialog({
  open,
  onOpenChange,
  account,
}: ReserveAccountFormDialogProps) {
  const isEdit = !!account
  const create = useCreateReserveAccount()
  const update = useUpdateReserveAccount()
  const { data: cdi } = useCdi()

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ReserveAccountFormData>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      name: '',
      institution: '',
      openedAt: todayISO(),
      saldoInicial: '',
      rateKind: 'cdi',
      rateValue: '100',
      goalAmount: '',
      goalDate: '',
      goalMonthlyContribution: '',
      color: DEFAULT_COLOR,
    },
  })

  // Reset form when dialog opens or the editing target changes
  useEffect(() => {
    if (open) {
      reset({
        name: account?.name ?? '',
        institution: account?.institution ?? '',
        openedAt: account?.openedAt ?? todayISO(),
        saldoInicial: '',
        rateKind: account?.rate.kind ?? 'cdi',
        // API stores the rate as a decimal STRING ("102.000000"); pre-fill in BR
        // comma format so it round-trips through parseAmountInput on submit.
        rateValue: account ? rateToInput(account.rate.value) : '100',
        goalAmount: moneyToInput(account?.goalAmount),
        goalDate: account?.goalDate ?? '',
        goalMonthlyContribution: moneyToInput(account?.goalMonthlyContribution),
        color: account?.color ?? DEFAULT_COLOR,
      })
    }
  }, [open, account, reset])

  const selectedKind = watch('rateKind')
  const selectedColor = watch('color') ?? DEFAULT_COLOR
  const rateValueRaw = watch('rateValue') ?? ''

  /** PERCENT of the annual CDI in force today; null when there is none. */
  const cdiAnnual = cdi?.vigenteHoje.annualRate ?? null

  /**
   * Live preview of the typed rate, always with the THREE readings (§7.4).
   * It is the defence against the most likely user mistake — typing `12`
   * meaning "% per year" into a "% per month" field — and against the myth
   * that annual ÷ 12 = monthly.
   */
  const preview = useMemo(() => {
    const parsed = parseAmountInput(rateValueRaw)
    if (parsed === null || parsed <= 0) return null
    const monthly = effectiveMonthlyRate(selectedKind, parsed, cdiAnnual)
    if (monthly === null) return null
    const annual = annualEquivalent(monthly)
    return {
      linha:
        `Equivale a ≈${formatPercentBR(monthly)} ao mês · ` +
        `${formatPercentBR(annual)} ao ano · ` +
        `em R$ 10.000 renderia ${formatBRL(monthly * PREVIEW_BASE)}/mês`,
      label: formatRateLabel(selectedKind, String(parsed), monthly),
    }
  }, [selectedKind, rateValueRaw, cdiAnnual])

  async function onSubmit(data: ReserveAccountFormData) {
    const parsedRate = parseAmountInput(data.rateValue)
    if (parsedRate === null) {
      toast.error('Taxa inválida. Use um número como 0,85 ou 102.')
      return
    }

    const parsedSaldoInicial = data.saldoInicial?.trim()
      ? parseAmountInput(data.saldoInicial)
      : undefined
    if (data.saldoInicial?.trim() && parsedSaldoInicial === null) {
      toast.error('Saldo inicial inválido. Use formato como 1234,56.')
      return
    }

    const parsedGoal = data.goalAmount?.trim()
      ? parseAmountInput(data.goalAmount)
      : undefined
    if (data.goalAmount?.trim() && parsedGoal === null) {
      toast.error('Valor da meta inválido. Use formato como 1234,56.')
      return
    }

    const parsedContribution = data.goalMonthlyContribution?.trim()
      ? parseAmountInput(data.goalMonthlyContribution)
      : undefined
    if (data.goalMonthlyContribution?.trim() && parsedContribution === null) {
      toast.error('Aporte mensal inválido. Use formato como 1234,56.')
      return
    }

    // Money goes to the API as a NUMBER in this module (§6.3), and rateValue
    // is a PERCENT (0.85 | 12.5 | 102), never a fraction.
    const common = {
      name: data.name,
      institution: data.institution?.trim() ? data.institution.trim() : undefined,
      color: data.color ?? DEFAULT_COLOR,
      rateKind: data.rateKind,
      rateValue: parsedRate,
      goalAmount: parsedGoal ?? undefined,
      goalDate: data.goalDate?.trim() ? data.goalDate : undefined,
      goalMonthlyContribution: parsedContribution ?? undefined,
    }

    try {
      if (isEdit && account) {
        // `openedAt` is immutable and `saldoInicial` only exists on create.
        // On edit, a cleared field must travel as an explicit `null` — `undefined`
        // is dropped from the JSON body, so the API would keep the old value and
        // the goal (or institution) could never be removed.
        const payload: UpdateReserveAccountPayload = {
          ...common,
          institution: common.institution ?? null,
          goalAmount: common.goalAmount ?? null,
          goalDate: common.goalDate ?? null,
          goalMonthlyContribution: common.goalMonthlyContribution ?? null,
        }
        const updated = await update.mutateAsync({ id: account.id, payload })
        toast.success('Caixinha atualizada')
        if (updated.recalcularSugerido) {
          toast.info(
            'A mudança afeta meses que já renderam. Use "Atualizar rendimentos" para refazer as contas.'
          )
        }
      } else {
        const payload: CreateReserveAccountPayload = {
          ...common,
          openedAt: data.openedAt,
          saldoInicial: parsedSaldoInicial ?? undefined,
        }
        await create.mutateAsync(payload)
        toast.success('Caixinha criada')
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
            {isEdit ? 'Editar caixinha' : 'Nova caixinha'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 pt-1">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="reserve-name">Nome *</Label>
            <Input
              id="reserve-name"
              placeholder="Ex.: Reserva de emergência"
              aria-invalid={!!errors.name}
              {...register('name')}
            />
            {errors.name?.message && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          {/* Institution */}
          <div className="space-y-1.5">
            <Label htmlFor="reserve-institution">Onde está o dinheiro</Label>
            <Input
              id="reserve-institution"
              placeholder="Ex.: Nubank"
              {...register('institution')}
            />
          </div>

          {/* Opened at */}
          <div className="space-y-1.5">
            <Label htmlFor="reserve-opened-at">Aberta em *</Label>
            <Input
              id="reserve-opened-at"
              type="date"
              disabled={isEdit}
              aria-invalid={!!errors.openedAt}
              {...register('openedAt')}
            />
            <p className="text-xs text-muted-foreground">
              {isEdit
                ? 'A data de abertura não muda depois que a caixinha existe.'
                : 'O dinheiro rende a partir do dia em que entra.'}
            </p>
            {errors.openedAt?.message && (
              <p className="text-xs text-destructive">{errors.openedAt.message}</p>
            )}
          </div>

          {/* Saldo inicial — create only */}
          {!isEdit && (
            <div className="space-y-1.5">
              <Label htmlFor="reserve-saldo-inicial">Quanto já tem lá (R$)</Label>
              <Input
                id="reserve-saldo-inicial"
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                {...register('saldoInicial')}
              />
              <p className="text-xs text-muted-foreground">
                Opcional. Use vírgula como separador decimal.
              </p>
            </div>
          )}

          {/* Rate */}
          <div className="space-y-3 border-t pt-4">
            <p className="text-sm font-medium text-foreground">Quanto rende</p>

            <div className="space-y-1.5">
              <Label htmlFor="account-rate-kind">Tipo de taxa *</Label>
              <Select
                value={selectedKind}
                onValueChange={(v) => setValue('rateKind', v as RateKind)}
              >
                <SelectTrigger id="account-rate-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['monthly', 'yearly', 'cdi'] as RateKind[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {RATE_KIND_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reserve-rate-value">Taxa *</Label>
              <div className="relative">
                <Input
                  id="reserve-rate-value"
                  type="text"
                  inputMode="decimal"
                  className="pr-24"
                  placeholder={RATE_KIND_PLACEHOLDER[selectedKind]}
                  aria-invalid={!!errors.rateValue}
                  {...register('rateValue')}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  {RATE_KIND_SUFFIX[selectedKind]}
                </span>
              </div>
              {errors.rateValue?.message && (
                <p className="text-xs text-destructive">{errors.rateValue.message}</p>
              )}

              {/* Live preview — the three readings of the typed rate */}
              {preview ? (
                <div className="space-y-0.5 rounded-md border border-border bg-muted/40 px-3 py-2">
                  <p className="text-xs text-foreground">{preview.linha}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Na lista aparece como {preview.label}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {selectedKind === 'cdi' && cdiAnnual == null
                    ? 'Informe o CDI do ano para ver quanto isso rende por mês.'
                    : 'Digite a taxa para ver quanto isso rende por mês.'}
                </p>
              )}
            </div>
          </div>

          {/* Goal */}
          <div className="space-y-3 border-t pt-4">
            <p className="text-sm font-medium text-foreground">Meta (opcional)</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="reserve-goal-amount">Quanto quer juntar (R$)</Label>
                <Input
                  id="reserve-goal-amount"
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  {...register('goalAmount')}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reserve-goal-date">Até quando</Label>
                <Input
                  id="reserve-goal-date"
                  type="date"
                  {...register('goalDate')}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reserve-goal-contribution">
                Quanto pretende guardar por mês (R$)
              </Label>
              <Input
                id="reserve-goal-contribution"
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                {...register('goalMonthlyContribution')}
              />
            </div>
          </div>

          {/* Color */}
          <div className="space-y-1.5">
            <Label htmlFor="reserve-color">Cor</Label>
            <div className="flex items-center gap-2">
              <Input
                id="reserve-color"
                type="color"
                className="h-9 w-14 cursor-pointer p-1"
                {...register('color')}
              />
              <span className="text-xs text-muted-foreground">{selectedColor}</span>
            </div>
            {errors.color?.message && (
              <p className="text-xs text-destructive">{errors.color.message}</p>
            )}
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
              {isEdit ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
