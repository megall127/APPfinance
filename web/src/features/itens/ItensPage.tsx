import { useState, useMemo } from 'react'
import {
  Plus,
  TrendingUp,
  TrendingDown,
  CreditCard,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useCategories } from '@/features/categorias/useCategories'
import { useItems, useDeleteItem, type Item, type ItemKind } from './useItems'
import { ItemFormDialog } from './ItemFormDialog'
import { ItemRow } from './ItemRow'
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog'

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
        open={!!toDelete}
        entityLabel="o item"
        entityName={toDelete?.name}
        hint="Se ele tiver lançamentos associados, será desativado em vez de excluído."
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setToDelete(null)}
        isPending={deleteItem.isPending}
      />
    </div>
  )
}
