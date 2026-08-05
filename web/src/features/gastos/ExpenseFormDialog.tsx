import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { LoaderCircle, Trash2 } from 'lucide-react'
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
import { parseAmountInput } from '@/features/lancamentos/math'
import { useCategories } from '@/features/categorias/useCategories'
import { defaultSpentOn } from './grouping'
import {
  useCreateExpense,
  useDeleteExpense,
  useUpdateExpense,
  type VariableExpense,
} from './useVariableExpenses'

/** O Select do Radix não aceita value="" — daí um sentinela explícito. */
const NO_CATEGORY = '__none__'

const expenseSchema = z.object({
  amount: z
    .string()
    .min(1, 'Informe o valor')
    .refine((value) => {
      const parsed = parseAmountInput(value)
      return parsed !== null && parsed > 0
    }, 'Valor inválido'),
  spentOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida'),
  description: z.string().max(180, 'Máximo de 180 caracteres').optional(),
  categoryId: z.string(),
})

type ExpenseFormData = z.infer<typeof expenseSchema>

interface ExpenseFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Gasto em edição, ou null para criar um novo. */
  expense: VariableExpense | null
  year: number
  month: number
}

export function ExpenseFormDialog({
  open,
  onOpenChange,
  expense,
  year,
  month,
}: ExpenseFormDialogProps) {
  const { data: categories } = useCategories()
  const create = useCreateExpense(year, month)
  const update = useUpdateExpense(year, month)
  const remove = useDeleteExpense(year, month)

  const form = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      amount: '',
      spentOn: defaultSpentOn(year, month, new Date()),
      description: '',
      categoryId: NO_CATEGORY,
    },
  })

  // Re-preenche sempre que o diálogo abre, para não herdar o gasto anterior.
  useEffect(() => {
    if (!open) return
    form.reset(
      expense
        ? {
            amount: String(Number(expense.amount)),
            spentOn: expense.spentOn,
            description: expense.description ?? '',
            // String() obrigatório: categoryId chega como NÚMERO da API, e o campo
            // é z.string(). Sem isso o zodResolver falha com invalid_type e o
            // handleSubmit nunca dispara — o botão Salvar vira um clique morto.
            categoryId: expense.categoryId != null ? String(expense.categoryId) : NO_CATEGORY,
          }
        : {
            amount: '',
            spentOn: defaultSpentOn(year, month, new Date()),
            description: '',
            categoryId: NO_CATEGORY,
          },
    )
  }, [open, expense, form, year, month])

  const pending = create.isPending || update.isPending || remove.isPending

  function onSubmit(data: ExpenseFormData) {
    const amount = parseAmountInput(data.amount)
    if (amount === null) return

    const description = data.description?.trim()
    const base = {
      amount,
      spentOn: data.spentOn,
      categoryId: data.categoryId === NO_CATEGORY ? null : Number(data.categoryId),
    }

    if (expense) {
      // Na EDIÇÃO a descrição vai sempre, inclusive como null, senão apagar o
      // campo não apaga nada: undefined some do corpo do PATCH e o service, que
      // só altera o que recebe, mantém o texto antigo. Mesmo cuidado que o
      // MovementFormDialog de reservas documenta.
      update.mutate(
        {
          id: expense.id,
          previousSpentOn: expense.spentOn,
          payload: { ...base, description: description ? description : null },
        },
        {
          onSuccess: () => {
            toast.success('Gasto atualizado')
            onOpenChange(false)
          },
          onError: () => toast.error('Não deu para salvar. Tente de novo.'),
        },
      )
      return
    }

    // Na CRIAÇÃO vai undefined, e não null: o createVariableExpenseValidator não
    // é .nullable() (não há descrição anterior para limpar), então null daria 422.
    create.mutate({ ...base, description: description ? description : undefined }, {
      onSuccess: () => {
        toast.success('Gasto anotado')
        onOpenChange(false)
      },
      onError: () => toast.error('Não deu para salvar. Tente de novo.'),
    })
  }

  function onDelete() {
    if (!expense) return
    remove.mutate(
      { id: expense.id, spentOn: expense.spentOn },
      {
        onSuccess: () => {
          toast.success('Gasto excluído')
          onOpenChange(false)
        },
        onError: () => toast.error('Não deu para excluir. Tente de novo.'),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{expense ? 'Editar gasto' : 'Novo gasto'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="amount">Valor</Label>
            <Input
              id="amount"
              inputMode="decimal"
              placeholder="0,00"
              autoFocus
              {...form.register('amount')}
            />
            {form.formState.errors.amount && (
              <p className="text-xs text-destructive">{form.formState.errors.amount.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">O que foi</Label>
            <Input id="description" placeholder="Almoço, Uber…" {...form.register('description')} />
            {form.formState.errors.description && (
              <p className="text-xs text-destructive">
                {form.formState.errors.description.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="spentOn">Data</Label>
            <Input id="spentOn" type="date" {...form.register('spentOn')} />
            {form.formState.errors.spentOn && (
              <p className="text-xs text-destructive">{form.formState.errors.spentOn.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="categoryId">Categoria</Label>
            <Select
              value={form.watch('categoryId')}
              onValueChange={(value) => form.setValue('categoryId', value)}
            >
              <SelectTrigger id="categoryId" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CATEGORY}>Sem categoria</SelectItem>
                {(categories ?? []).map((category) => (
                  <SelectItem key={category.id} value={String(category.id)}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            {expense ? (
              <Button
                type="button"
                variant="ghost"
                onClick={onDelete}
                disabled={pending}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                Excluir
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={pending}>
              {pending && <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
