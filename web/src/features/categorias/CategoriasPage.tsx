import { useState, useMemo } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useCategories, useDeleteCategory, type Category } from './useCategories'
import { CategoryFormDialog } from './CategoryFormDialog'
import { ICON_MAP } from './iconRegistry'

// ── Category row ──────────────────────────────────────────────────────────────

interface CategoryRowProps {
  category: Category
  onEdit: (cat: Category) => void
  onDelete: (cat: Category) => void
}

function CategoryRow({ category, onEdit, onDelete }: CategoryRowProps) {
  const IconCmp = category.icon ? ICON_MAP[category.icon] : undefined
  const color = category.color ?? '#94a3b8'
  const isArchived = Boolean(category.archived)

  return (
    <div className="flex items-center gap-3 py-3 px-4 rounded-lg hover:bg-muted/50 transition-colors group">
      {/* Color swatch + optional icon */}
      <span
        className="flex-shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full"
        style={{ backgroundColor: color }}
      >
        {IconCmp ? (
          <IconCmp className="h-4 w-4 text-white" />
        ) : null}
      </span>

      {/* Name + archived badge */}
      <div className="flex-1 min-w-0">
        <span className="font-medium text-sm text-foreground truncate">
          {category.name}
        </span>
        {isArchived && (
          <Badge variant="secondary" className="ml-2 text-xs">
            Arquivada
          </Badge>
        )}
      </div>

      {/* Color label */}
      <span
        className="hidden sm:inline text-xs font-mono px-2 py-0.5 rounded-md text-white"
        style={{ backgroundColor: color }}
      >
        {color}
      </span>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Editar"
          onClick={() => onEdit(category)}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive hover:text-destructive"
          aria-label="Excluir"
          onClick={() => onDelete(category)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

// ── Delete confirm dialog ─────────────────────────────────────────────────────

interface DeleteConfirmProps {
  category: Category | null
  onConfirm: () => void
  onCancel: () => void
  isPending: boolean
}

function DeleteConfirmDialog({
  category,
  onConfirm,
  onCancel,
  isPending,
}: DeleteConfirmProps) {
  return (
    <Dialog open={!!category} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Confirmar exclusão</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Deseja excluir a categoria{' '}
          <span className="font-semibold text-foreground">
            {category?.name}
          </span>
          ?{' '}
          <span className="block mt-1">
            Se ela tiver itens vinculados, será arquivada em vez de excluída.
          </span>
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isPending}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? 'Aguarde…' : 'Excluir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Skeleton loader ───────────────────────────────────────────────────────────

function CategorySkeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="w-9 h-9 rounded-full" />
          <Skeleton className="h-4 flex-1 max-w-[200px]" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CategoriasPage() {
  const { data: categories, isLoading, isError } = useCategories()
  const deleteCategory = useDeleteCategory()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Category | undefined>(undefined)
  const [toDelete, setToDelete] = useState<Category | null>(null)

  // Separate active from archived
  const { active, archived } = useMemo(() => {
    const all = categories ?? []
    return {
      active: all.filter((c) => !Boolean(c.archived)),
      archived: all.filter((c) => Boolean(c.archived)),
    }
  }, [categories])

  function handleAdd() {
    setEditing(undefined)
    setFormOpen(true)
  }

  function handleEdit(cat: Category) {
    setEditing(cat)
    setFormOpen(true)
  }

  function handleDeleteRequest(cat: Category) {
    setToDelete(cat)
  }

  async function handleDeleteConfirm() {
    if (!toDelete) return
    try {
      const result = await deleteCategory.mutateAsync(toDelete.id)
      if (result.archived) {
        toast.success('Categoria arquivada')
      } else {
        toast.success('Categoria removida')
      }
    } catch {
      toast.error('Erro ao excluir categoria. Tente novamente.')
    } finally {
      setToDelete(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Categorias
          </h1>
          <p className="text-sm text-muted-foreground">
            Agrupe seus itens por categoria com cor e ícone.
          </p>
        </div>
        <Button onClick={handleAdd} className="sm:self-start gap-2">
          <Plus className="h-4 w-4" />
          Nova categoria
        </Button>
      </div>

      {/* ── Main card ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">
            {isLoading
              ? 'Carregando…'
              : `${active.length} categoria${active.length !== 1 ? 's' : ''} ativa${active.length !== 1 ? 's' : ''}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          {isLoading && <CategorySkeleton />}

          {isError && (
            <p className="text-destructive text-sm py-6 text-center px-4">
              Erro ao carregar categorias. Tente novamente.
            </p>
          )}

          {!isLoading && !isError && active.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">Nenhuma categoria criada ainda.</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={handleAdd}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Criar primeira categoria
              </Button>
            </div>
          )}

          {!isLoading && !isError && active.length > 0 && (
            <div className="divide-y divide-border">
              {active.map((cat) => (
                <CategoryRow
                  key={cat.id}
                  category={cat}
                  onEdit={handleEdit}
                  onDelete={handleDeleteRequest}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Archived card (collapsed by default) ── */}
      {!isLoading && archived.length > 0 && (
        <Card className="border-dashed opacity-75">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Arquivadas ({archived.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 pb-2">
            <div className="divide-y divide-border">
              {archived.map((cat) => (
                <CategoryRow
                  key={cat.id}
                  category={cat}
                  onEdit={handleEdit}
                  onDelete={handleDeleteRequest}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Form dialog ── */}
      <CategoryFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        category={editing}
      />

      {/* ── Delete confirm dialog ── */}
      <DeleteConfirmDialog
        category={toDelete}
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setToDelete(null)}
        isPending={deleteCategory.isPending}
      />
    </div>
  )
}
