import { useState, useMemo } from 'react'
import {
  Plus,
  Pencil,
  Trash2,
  TrendingUp,
  TrendingDown,
  CreditCard,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatBRL } from '@/lib/format'
import { useCategories } from '@/features/categorias/useCategories'
import { useItems, useDeleteItem, type Item, type ItemKind } from './useItems'
import { ItemFormDialog } from './ItemFormDialog'

// ── Tab config ────────────────────────────────────────────────────────────────

interface TabDef {
  kind: ItemKind
  label: string
  Icon: React.ComponentType<{ className?: string }>
  emptyText: string
}

const TABS: TabDef[] = [
  {
    kind: 'expense',
    label: 'Despesas',
    Icon: TrendingDown,
    emptyText: 'Nenhuma despesa cadastrada.',
  },
  {
    kind: 'income',
    label: 'Receitas',
    Icon: TrendingUp,
    emptyText: 'Nenhuma receita cadastrada.',
  },
  {
    kind: 'card_subscription',
    label: 'Cartão',
    Icon: CreditCard,
    emptyText: 'Nenhum cartão / assinatura cadastrado.',
  },
]

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
          Deseja excluir o item{' '}
          <span className="font-semibold text-foreground">{item?.name}</span>?{' '}
          <span className="block mt-1">
            Se ele tiver lançamentos associados, será desativado em vez de
            excluído.
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

// ── Item row ──────────────────────────────────────────────────────────────────

interface ItemRowProps {
  item: Item
  categoryName?: string
  categoryColor?: string
  onEdit: (item: Item) => void
  onDelete: (item: Item) => void
}

function ItemRow({
  item,
  categoryName,
  categoryColor,
  onEdit,
  onDelete,
}: ItemRowProps) {
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

// ── Tab panel (one per kind) ──────────────────────────────────────────────────

interface TabPanelProps {
  kind: ItemKind
  emptyText: string
  categoryMap: Map<string, { name: string; color: string | null }>
  onAdd: () => void
  onEdit: (item: Item) => void
  onDelete: (item: Item) => void
}

function TabPanel({
  kind,
  emptyText,
  categoryMap,
  onAdd,
  onEdit,
  onDelete,
}: TabPanelProps) {
  const { data: items, isLoading, isError } = useItems(kind)

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-4 flex-1 max-w-[220px]" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <p className="text-destructive text-sm py-6 text-center">
        Erro ao carregar. Tente novamente.
      </p>
    )
  }

  if (!items || items.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-sm">{emptyText}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Adicionar
        </Button>
      </div>
    )
  }

  return (
    <div className="divide-y divide-border">
      {items.map((item) => {
        const cat = item.categoryId
          ? categoryMap.get(item.categoryId)
          : undefined
        return (
          <ItemRow
            key={item.id}
            item={item}
            categoryName={cat?.name}
            categoryColor={cat?.color ?? undefined}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        )
      })}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ItensPage() {
  const { data: categories } = useCategories()
  const deleteItem = useDeleteItem()

  const [activeTab, setActiveTab] = useState<ItemKind>('expense')
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
        toast.success('Item desativado')
      } else {
        toast.success('Item removido')
      }
    } catch {
      toast.error('Erro ao excluir item. Tente novamente.')
    } finally {
      setToDelete(null)
    }
  }

  const activeTabDef = TABS.find((t) => t.kind === activeTab) ?? TABS[0]

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Itens
          </h1>
          <p className="text-sm text-muted-foreground">
            Gerencie receitas, despesas e assinaturas de cartão.
          </p>
        </div>
        <Button onClick={handleAdd} className="sm:self-start gap-2">
          <Plus className="h-4 w-4" />
          Novo item
        </Button>
      </div>

      {/* ── Tabs card ── */}
      <Card>
        <CardHeader className="pb-0 border-b">
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as ItemKind)}
          >
            <TabsList className="mb-3">
              {TABS.map(({ kind, label, Icon }) => (
                <TabsTrigger key={kind} value={kind}>
                  <span className="flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </CardHeader>

        <CardContent className="p-0 pb-2">
          <TabPanel
            kind={activeTab}
            emptyText={activeTabDef.emptyText}
            categoryMap={categoryMap}
            onAdd={handleAdd}
            onEdit={handleEdit}
            onDelete={handleDeleteRequest}
          />
        </CardContent>
      </Card>

      {/* ── Form dialog ── */}
      <ItemFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        item={editing}
        defaultKind={activeTab}
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
