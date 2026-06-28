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
import { useCategories } from '@/features/categorias/useCategories'
import { parseAmountInput } from '@/features/lancamentos/math'
import {
  type Item,
  type ItemKind,
  type CreateItemPayload,
  useCreateItem,
  useUpdateItem,
} from './useItems'

// ── Zod schema ────────────────────────────────────────────────────────────────

const itemSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  kind: z.enum(['income', 'expense', 'card_subscription']),
  categoryId: z.string().optional(),
  defaultAmount: z.string().optional(),
})

type ItemFormData = z.infer<typeof itemSchema>

// ── Kind labels ───────────────────────────────────────────────────────────────

const KIND_LABELS: Record<ItemKind, string> = {
  income: 'Receita',
  expense: 'Despesa',
  card_subscription: 'Cartão / Assinatura',
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ItemFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item?: Item
  defaultKind?: ItemKind
  /** When true, replaces the kind <Select> with a read-only display. */
  lockKind?: boolean
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ItemFormDialog({
  open,
  onOpenChange,
  item,
  defaultKind = 'expense',
  lockKind = false,
}: ItemFormDialogProps) {
  const isEdit = !!item
  const create = useCreateItem()
  const update = useUpdateItem()
  const { data: categories } = useCategories()

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ItemFormData>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      name: '',
      kind: defaultKind,
      categoryId: '__none__',
      defaultAmount: '',
    },
  })

  // Reset form when dialog opens or the editing target changes
  useEffect(() => {
    if (open) {
      reset({
        name: item?.name ?? '',
        kind: item?.kind ?? defaultKind,
        // Radix Select is string-based; category ids arrive as numbers at
        // runtime, so coerce to string for the control to match SelectItem values.
        categoryId: item?.categoryId != null ? String(item.categoryId) : '__none__',
        // API returns dot-decimal ("264.60"); pre-fill in BR comma format so
        // the value round-trips through parseAmountInput on submit.
        defaultAmount: item?.defaultAmount
          ? Number(item.defaultAmount).toFixed(2).replace('.', ',')
          : '',
      })
    }
  }, [open, item, defaultKind, reset])

  const selectedKind = watch('kind')
  const selectedCategoryId = watch('categoryId') ?? '__none__'

  async function onSubmit(data: ItemFormData) {
    const parsedAmount = data.defaultAmount
      ? parseAmountInput(data.defaultAmount)
      : undefined
    if (data.defaultAmount && data.defaultAmount.trim() !== '' && parsedAmount === null) {
      toast.error('Valor padrão inválido. Use formato como 1234,56.')
      return
    }

    const payload: CreateItemPayload = {
      name: data.name,
      kind: data.kind,
      categoryId:
        data.categoryId && data.categoryId !== '__none__'
          ? data.categoryId
          : undefined,
      // The API validates defaultAmount as a decimal STRING (e.g. "54.75"),
      // so serialize the parsed number to a 2-decimal string.
      defaultAmount: parsedAmount != null ? parsedAmount.toFixed(2) : undefined,
    }

    try {
      if (isEdit && item) {
        await update.mutateAsync({ id: item.id, payload })
        toast.success('Item atualizado')
      } else {
        await create.mutateAsync(payload)
        toast.success('Item criado')
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
          <DialogTitle>{isEdit ? 'Editar item' : 'Novo item'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 pt-1">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="item-name">Nome *</Label>
            <Input
              id="item-name"
              placeholder="Ex.: Supermercado"
              aria-invalid={!!errors.name}
              {...register('name')}
            />
            {errors.name?.message && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          {/* Kind */}
          <div className="space-y-1.5">
            <Label>Tipo *</Label>
            {lockKind ? (
              <Input
                readOnly
                disabled
                value={KIND_LABELS[selectedKind]}
                className="cursor-default"
              />
            ) : (
              <Select
                value={selectedKind}
                onValueChange={(v) => setValue('kind', v as ItemKind)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(
                    ['income', 'expense', 'card_subscription'] as ItemKind[]
                  ).map((k) => (
                    <SelectItem key={k} value={k}>
                      {KIND_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {errors.kind?.message && (
              <p className="text-xs text-destructive">{errors.kind.message}</p>
            )}
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Select
              value={selectedCategoryId}
              onValueChange={(v) => setValue('categoryId', v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sem categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">
                  <span className="text-muted-foreground">Sem categoria</span>
                </SelectItem>
                {(categories ?? []).map((cat) => (
                  <SelectItem key={cat.id} value={String(cat.id)}>
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                        style={{
                          backgroundColor: cat.color ?? '#94a3b8',
                        }}
                      />
                      {cat.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Default amount */}
          <div className="space-y-1.5">
            <Label htmlFor="item-amount">Valor padrão (R$)</Label>
            <Input
              id="item-amount"
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              {...register('defaultAmount')}
            />
            <p className="text-xs text-muted-foreground">
              Opcional. Use vírgula como separador decimal.
            </p>
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
