import { useState, useMemo } from 'react'
import { CreditCard, Plus, Pencil, Trash2, LoaderCircle } from 'lucide-react'
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
import { formatBRL } from '@/lib/format'
import { useCategories } from '@/features/categorias/useCategories'
import { useItems, useDeleteItem, type Item } from '@/features/itens/useItems'
import { ItemFormDialog } from '@/features/itens/ItemFormDialog'

// ── Delete confirm dialog ─────────────────────────────────────────────────────

interface DeleteConfirmProps {
  item: Item | null
  onConfirm: () => void
  onCancel: () => void
  isPending: boolean
}

function DeleteConfirmDialog({
  item,
  onConfirm,
  onCancel,
  isPending,
}: DeleteConfirmProps) {
  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Confirmar exclusão</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Deseja excluir a assinatura{' '}
          <span className="font-semibold text-foreground">{item?.name}</span>?{' '}
          <span className="block mt-1">
            Se ela tiver lançamentos associados, será desativada em vez de
            excluída.
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
            {isPending ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin mr-1" />
                Aguarde…
              </>
            ) : (
              'Excluir'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Subscription row ──────────────────────────────────────────────────────────

interface SubscriptionRowProps {
  item: Item
  categoryName?: string
  categoryColor?: string
  onEdit: (item: Item) => void
  onDelete: (item: Item) => void
}

function SubscriptionRow({
  item,
  categoryName,
  categoryColor,
  onEdit,
  onDelete,
}: SubscriptionRowProps) {
  const isActive = Boolean(item.isActive)
  const amount = item.defaultAmount ? Number(item.defaultAmount) : null

  return (
    <div
      className={`flex items-center gap-3 py-3 px-4 rounded-lg hover:bg-muted/50 transition-colors group ${
        !isActive ? 'opacity-50' : ''
      }`}
    >
      {/* Name + inactive badge */}
      <div className="flex-1 min-w-0">
        <span className="font-medium text-sm text-foreground truncate block">
          {item.name}
          {!isActive && (
            <Badge variant="secondary" className="ml-2 text-xs">
              Inativo
            </Badge>
          )}
        </span>
      </div>

      {/* Category badge */}
      {categoryName && (
        <span
          className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full text-white shrink-0"
          style={{ backgroundColor: categoryColor ?? '#94a3b8' }}
        >
          {categoryName}
        </span>
      )}

      {/* Default amount */}
      {amount !== null && !isNaN(amount) && (
        <span className="text-sm tabular-nums text-foreground/80 shrink-0">
          {formatBRL(amount)}
        </span>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Editar"
          onClick={() => onEdit(item)}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive hover:text-destructive"
          aria-label="Excluir"
          onClick={() => onDelete(item)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AssinaturasPage() {
  const { data: items, isLoading, isError } = useItems('card_subscription')
  const { data: categories } = useCategories()
  const deleteItem = useDeleteItem()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Item | undefined>(undefined)
  const [toDelete, setToDelete] = useState<Item | null>(null)

  // Category lookup map
  const categoryMap = useMemo(
    () =>
      new Map(
        (categories ?? []).map((c) => [c.id, { name: c.name, color: c.color }]),
      ),
    [categories],
  )

  // Total: sum of defaultAmount for active subscriptions only
  const totalMensal = useMemo(() => {
    if (!items) return 0
    return items
      .filter((it) => Boolean(it.isActive))
      .reduce((acc, it) => acc + (Number.isFinite(Number(it.defaultAmount)) ? Number(it.defaultAmount) : 0), 0)
  }, [items])

  function handleAdd() {
    setEditing(undefined)
    setFormOpen(true)
  }

  function handleEdit(item: Item) {
    setEditing(item)
    setFormOpen(true)
  }

  function handleDeleteRequest(item: Item) {
    setToDelete(item)
  }

  async function handleDeleteConfirm() {
    if (!toDelete) return
    try {
      const result = await deleteItem.mutateAsync(toDelete.id)
      if (result.deactivated) {
        toast.success('Assinatura desativada')
      } else {
        toast.success('Assinatura removida')
      }
    } catch {
      toast.error('Erro ao excluir assinatura. Tente novamente.')
    } finally {
      setToDelete(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <CreditCard className="h-6 w-6 text-primary" />
            Assinaturas
          </h1>
          <p className="text-sm text-muted-foreground">
            Gerencie seus cartões e assinaturas recorrentes.
          </p>
        </div>
        <Button onClick={handleAdd} className="sm:self-start gap-2">
          <Plus className="h-4 w-4" />
          Nova assinatura
        </Button>
      </div>

      {/* ── Summary card ── */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-primary flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Total mensal estimado
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-8 w-36" />
          ) : isError ? (
            <p className="text-3xl font-bold text-muted-foreground tabular-nums">—</p>
          ) : (
            <>
              <p className="text-3xl font-bold text-primary tabular-nums">
                {formatBRL(totalMensal)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Valor informativo — <strong>não entra no Total do mês</strong>.
                Somente assinaturas ativas são somadas.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── List card ── */}
      <Card>
        <CardContent className="p-0 pb-2">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-4 flex-1 max-w-[220px]" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          ) : isError ? (
            <p className="text-destructive text-sm py-6 text-center">
              Erro ao carregar. Tente novamente.
            </p>
          ) : !items || items.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CreditCard className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nenhuma assinatura cadastrada.</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={handleAdd}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Adicionar assinatura
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {items.map((item) => {
                const cat = item.categoryId
                  ? categoryMap.get(item.categoryId)
                  : undefined
                return (
                  <SubscriptionRow
                    key={item.id}
                    item={item}
                    categoryName={cat?.name}
                    categoryColor={cat?.color ?? undefined}
                    onEdit={handleEdit}
                    onDelete={handleDeleteRequest}
                  />
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Form dialog ── */}
      <ItemFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        item={editing}
        defaultKind="card_subscription"
        lockKind={true}
      />

      {/* ── Delete confirm dialog ── */}
      <DeleteConfirmDialog
        item={toDelete}
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setToDelete(null)}
        isPending={deleteItem.isPending}
      />
    </div>
  )
}
