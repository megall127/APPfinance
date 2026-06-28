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
import { cn } from '@/lib/utils'
import {
  type Category,
  type CreateCategoryPayload,
  useCreateCategory,
  useUpdateCategory,
} from './useCategories'
import { ICON_MAP, ICON_OPTIONS } from './iconRegistry'

// ── Zod schema ────────────────────────────────────────────────────────────────

const categorySchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  color: z.string().optional(),
  icon: z.string().optional(),
})

type CategoryFormData = z.infer<typeof categorySchema>

// ── Preset colors ─────────────────────────────────────────────────────────────

const PRESET_COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#64748b',
  '#a8a29e',
]

const DEFAULT_COLOR = '#3b82f6'

// ── Props ─────────────────────────────────────────────────────────────────────

interface CategoryFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  category?: Category
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CategoryFormDialog({
  open,
  onOpenChange,
  category,
}: CategoryFormDialogProps) {
  const isEdit = !!category
  const create = useCreateCategory()
  const update = useUpdateCategory()

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CategoryFormData>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: '', color: DEFAULT_COLOR, icon: '__none__' },
  })

  // Reset form when dialog opens or the editing target changes
  useEffect(() => {
    if (open) {
      reset({
        name: category?.name ?? '',
        color: category?.color ?? DEFAULT_COLOR,
        icon: category?.icon ?? '__none__',
      })
    }
  }, [open, category, reset])

  const selectedColor = watch('color') ?? DEFAULT_COLOR
  const selectedIcon = watch('icon') ?? '__none__'

  const SelectedIconCmp = ICON_MAP[selectedIcon]

  async function onSubmit(data: CategoryFormData) {
    const payload: CreateCategoryPayload = {
      name: data.name,
      color: data.color ?? DEFAULT_COLOR,
      icon:
        data.icon && data.icon !== '__none__' ? data.icon : undefined,
    }
    try {
      if (isEdit && category) {
        await update.mutateAsync({ id: category.id, payload })
        toast.success('Categoria atualizada')
      } else {
        await create.mutateAsync(payload)
        toast.success('Categoria criada')
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
            {isEdit ? 'Editar categoria' : 'Nova categoria'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 pt-1">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="cat-name">Nome *</Label>
            <Input
              id="cat-name"
              placeholder="Ex.: Alimentação"
              aria-invalid={!!errors.name}
              {...register('name')}
            />
            {errors.name?.message && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          {/* Color */}
          <div className="space-y-2">
            <Label>Cor</Label>
            <div className="flex flex-wrap gap-2 items-center">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={color}
                  onClick={() => setValue('color', color)}
                  className={cn(
                    'w-7 h-7 rounded-full border-2 transition-transform hover:scale-110',
                    selectedColor === color
                      ? 'border-foreground scale-110'
                      : 'border-transparent',
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
              {/* Native color picker for custom shades */}
              <input
                type="color"
                value={selectedColor}
                aria-label="Cor personalizada"
                onChange={(e) => setValue('color', e.target.value)}
                className="w-7 h-7 rounded cursor-pointer border border-input bg-transparent p-0"
                title="Cor personalizada"
              />
              {/* Color preview badge */}
              <span
                className="ml-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
                style={{ backgroundColor: selectedColor }}
              >
                {selectedColor}
              </span>
            </div>
          </div>

          {/* Icon */}
          <div className="space-y-1.5">
            <Label>Ícone</Label>
            <Select
              value={selectedIcon}
              onValueChange={(v) => setValue('icon', v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione um ícone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    Nenhum
                  </span>
                </SelectItem>
                {ICON_OPTIONS.map(({ value, label, Icon }) => (
                  <SelectItem key={value} value={value}>
                    <span className="flex items-center gap-2">
                      <Icon className="h-4 w-4 shrink-0" />
                      {label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Icon preview */}
            {SelectedIconCmp && (
              <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                <span
                  className="inline-flex items-center justify-center w-7 h-7 rounded-full"
                  style={{ backgroundColor: selectedColor }}
                >
                  <SelectedIconCmp className="h-4 w-4 text-white" />
                </span>
                <span>Pré-visualização</span>
              </div>
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
