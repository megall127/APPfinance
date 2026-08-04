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
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { MONTHS_PT, formatPercentBR } from '@/lib/format'
import { parseAmountInput } from '@/features/lancamentos/math'
import {
  type CdiSource,
  type UpsertCdiPayload,
  useCdi,
  useUpsertCdi,
} from './useReserves'

// ── Zod schema ────────────────────────────────────────────────────────────────

const cdiSchema = z
  .object({
    year: z.string().min(1, 'Ano é obrigatório'),
    month: z.string().min(1, 'Mês é obrigatório'),
    annualRate: z.string().min(1, 'CDI é obrigatório'),
  })
  .refine(
    (data) => {
      const parsed = parseAmountInput(data.annualRate)
      return parsed !== null && parsed >= 0 && parsed <= 100
    },
    { message: 'Informe um número entre 0 e 100, como 14,9.', path: ['annualRate'] }
  )

type CdiFormData = z.infer<typeof cdiSchema>

// ── Source copy ───────────────────────────────────────────────────────────────

/**
 * Explains, in family language, where the annual CDI in force came from.
 * `exact` is the only source that does NOT deserve the "CDI estimado" badge.
 */
const SOURCE_HINT: Record<CdiSource, string> = {
  exact: 'Você informou esse valor para o mês atual.',
  carry: 'Estamos repetindo o último CDI que você informou.',
  default: 'Você ainda não informou nenhum CDI, então usamos um valor de referência.',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** (2026, 7) → "Jul/2026". */
function periodLabel(year: number, month: number): string {
  return `${MONTHS_PT[month - 1] ?? month}/${year}`
}

/** decimal string of a rate ("14.900000") → BR format ("14,9"). */
function rateToInput(value: number | string | null | undefined): string {
  if (value == null || value === '') return ''
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return ''
  return String(parsed).replace('.', ',')
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface CdiRateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CdiRateDialog({ open, onOpenChange }: CdiRateDialogProps) {
  const { data, isLoading } = useCdi()
  const upsert = useUpsertCdi()

  const vigente = data?.vigenteHoje
  const historico = data?.historico ?? []

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CdiFormData>({
    resolver: zodResolver(cdiSchema),
    defaultValues: { year: '', month: '', annualRate: '' },
  })

  // Reset form when dialog opens or the rate in force changes
  useEffect(() => {
    if (open) {
      const now = new Date()
      reset({
        year: String(now.getFullYear()),
        month: String(now.getMonth() + 1),
        annualRate: rateToInput(vigente?.annualRate),
      })
    }
  }, [open, vigente?.annualRate, reset])

  const selectedMonth = watch('month') || String(new Date().getMonth() + 1)

  async function onSubmit(formData: CdiFormData) {
    const parsedRate = parseAmountInput(formData.annualRate)
    const parsedYear = Number.parseInt(formData.year, 10)
    const parsedMonth = Number.parseInt(formData.month, 10)
    if (parsedRate === null || Number.isNaN(parsedYear) || Number.isNaN(parsedMonth)) {
      toast.error('Preencha ano, mês e o CDI do período.')
      return
    }

    // `annualRate` is a PERCENT per year (14.9 = 14,90% a.a.), never a fraction.
    const payload: UpsertCdiPayload = {
      year: parsedYear,
      month: parsedMonth,
      annualRate: parsedRate,
    }

    try {
      const saved = await upsert.mutateAsync(payload)
      toast.success('CDI salvo')
      if (saved.recalcularSugerido) {
        toast.info(
          'O novo CDI vale para meses que já renderam. Use "Atualizar rendimentos" para refazer as contas.'
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
          <DialogTitle>CDI do ano</DialogTitle>
        </DialogHeader>

        {/* Rate in force today */}
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-56" />
          </div>
        ) : vigente ? (
          <div className="space-y-1 rounded-md border border-border bg-muted/40 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold tabular-nums text-foreground">
                {formatPercentBR(vigente.annualRate / 100, 2)} ao ano
              </span>
              {vigente.source !== 'exact' && (
                <Badge variant="secondary">CDI estimado</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {SOURCE_HINT[vigente.source]}
              {vigente.year != null && vigente.month != null
                ? ` Valendo desde ${periodLabel(vigente.year, vigente.month)}.`
                : ''}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Equivale a ≈{formatPercentBR(vigente.mensalEquivalente)} ao mês.
            </p>
          </div>
        ) : null}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cdi-year">Ano *</Label>
              <Input
                id="cdi-year"
                type="number"
                inputMode="numeric"
                min={2000}
                max={2200}
                aria-invalid={!!errors.year}
                {...register('year')}
              />
              {errors.year?.message && (
                <p className="text-xs text-destructive">{errors.year.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Vale a partir de *</Label>
              <Select
                value={selectedMonth}
                onValueChange={(v) => setValue('month', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS_PT.map((label, index) => (
                    <SelectItem key={label} value={String(index + 1)}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cdi-annual-rate">CDI ao ano *</Label>
            <div className="relative">
              <Input
                id="cdi-annual-rate"
                type="text"
                inputMode="decimal"
                className="pr-16"
                placeholder="Ex.: 14,9"
                aria-invalid={!!errors.annualRate}
                {...register('annualRate')}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                % a.a.
              </span>
            </div>
            {errors.annualRate?.message && (
              <p className="text-xs text-destructive">{errors.annualRate.message}</p>
            )}
            <p className="text-xs text-muted-foreground">
              O valor vale deste mês em diante, até você informar outro.
            </p>
          </div>

          {/* History */}
          <div className="space-y-2 border-t pt-4">
            <p className="text-sm font-medium text-foreground">
              Valores que você já informou
            </p>
            {historico.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhum valor informado ainda.
              </p>
            ) : (
              <ul className="space-y-1">
                {historico.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center justify-between text-xs text-muted-foreground"
                  >
                    <span>{periodLabel(entry.year, entry.month)}</span>
                    <span className="tabular-nums text-foreground">
                      {formatPercentBR(Number(entry.annualRate) / 100, 2)} a.a.
                    </span>
                  </li>
                ))}
              </ul>
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
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
