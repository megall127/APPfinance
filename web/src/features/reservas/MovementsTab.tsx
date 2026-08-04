import { useState } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog'
import { MovementRow } from './MovementRow'
import { MovementFormDialog } from './MovementFormDialog'
import {
  type Movement,
  type MovementKind,
  useDeleteMovement,
  useReserveAccounts,
  useReserveMovements,
} from './useReserves'

// ── Filtros ───────────────────────────────────────────────────────────────────

/** Sentinela dos <Select>: Radix não aceita SelectItem com value="". */
const ALL = '__all__'

const KIND_OPTIONS: { value: MovementKind; label: string }[] = [
  { value: 'deposit', label: 'Depósitos' },
  { value: 'withdrawal', label: 'Saques' },
  { value: 'yield', label: 'Rendimentos' },
  { value: 'adjustment', label: 'Ajustes' },
  { value: 'opening', label: 'Saldo inicial' },
]

/** Quantas linhas o botão "Carregar mais" acrescenta por clique. */
const PAGE_SIZE = 50
/** Teto de `limit` na API (§6.8). */
const MAX_LIMIT = 500

// ── Skeleton ──────────────────────────────────────────────────────────────────

function MovementsSkeleton() {
  return (
    <Card className="rounded-2xl p-2 shadow-sm">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="h-5 w-5 shrink-0 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </Card>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Aba "Movimentações" — a lista plana de §6.8, de todas as caixinhas.
 *
 * Conta, tipo e limite entram todos na query key (`reserveMovementsKey`), então
 * trocar de filtro — ou clicar em "Carregar mais" — busca de novo em vez de
 * filtrar no cliente. O hook mantém as linhas antigas na tela durante a troca
 * (`placeholderData`), para a lista não piscar.
 */
export function MovementsTab() {
  const [accountId, setAccountId] = useState<string>(ALL)
  const [kind, setKind] = useState<string>(ALL)
  const [limit, setLimit] = useState(PAGE_SIZE)

  const { data: accounts } = useReserveAccounts()
  const {
    data: movements,
    isLoading,
    isError,
  } = useReserveMovements({
    accountId: accountId === ALL ? undefined : accountId,
    kind: kind === ALL ? undefined : (kind as MovementKind),
    limit,
  })

  const deleteMovement = useDeleteMovement()

  const [editing, setEditing] = useState<Movement | undefined>(undefined)
  const [formOpen, setFormOpen] = useState(false)
  const [toDelete, setToDelete] = useState<Movement | null>(null)

  function handleAdd() {
    setEditing(undefined)
    setFormOpen(true)
  }

  function handleEdit(movement: Movement) {
    setEditing(movement)
    setFormOpen(true)
  }

  async function handleDeleteConfirm() {
    if (!toDelete) return
    try {
      const result = await deleteMovement.mutateAsync(toDelete.id)
      toast.success(
        result.recalcularSugerido
          ? 'Movimentação excluída. Os rendimentos serão atualizados.'
          : 'Movimentação excluída',
      )
    } catch {
      toast.error('Erro ao excluir a movimentação. Tente novamente.')
    } finally {
      setToDelete(null)
    }
  }

  const rows = movements ?? []
  // A API devolve no máximo `limit` linhas; se veio cheio, provavelmente há mais.
  const podeCarregarMais = rows.length >= limit && limit < MAX_LIMIT

  return (
    <div className="space-y-4">
      {/* ── Filtros + ação ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="space-y-1.5">
            <Label htmlFor="mov-filtro-caixinha">Caixinha</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger id="mov-filtro-caixinha" className="sm:w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas as caixinhas</SelectItem>
                {(accounts ?? []).map((account) => (
                  <SelectItem key={account.id} value={String(account.id)}>
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: account.color ?? '#94a3b8' }}
                      />
                      {account.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mov-filtro-tipo">Tipo</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger id="mov-filtro-tipo" className="sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos os tipos</SelectItem>
                {KIND_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button onClick={handleAdd} variant="outline" className="gap-2">
          <Plus className="h-4 w-4" />
          Nova movimentação
        </Button>
      </div>

      {/* ── Lista ── */}
      {isLoading && <MovementsSkeleton />}

      {isError && !isLoading && (
        <p className="py-6 text-center text-sm text-destructive">
          Erro ao carregar as movimentações. Tente novamente.
        </p>
      )}

      {!isLoading && !isError && rows.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">
          <p className="text-sm">Nenhuma movimentação por aqui ainda.</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={handleAdd}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Registrar a primeira
          </Button>
        </div>
      )}

      {!isLoading && !isError && rows.length > 0 && (
        <>
          <Card className="rounded-2xl p-2 shadow-sm">
            {rows.map((movement) => (
              <MovementRow
                key={movement.id}
                movement={movement}
                onEdit={handleEdit}
                onDelete={setToDelete}
              />
            ))}
          </Card>

          {podeCarregarMais && (
            <div className="text-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setLimit((atual) => Math.min(MAX_LIMIT, atual + PAGE_SIZE))
                }
              >
                Carregar mais
              </Button>
            </div>
          )}
        </>
      )}

      {/* ── Diálogos ── */}
      <MovementFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        movement={editing}
        defaultAccountId={accountId === ALL ? undefined : accountId}
      />

      <DeleteConfirmDialog
        open={!!toDelete}
        entityLabel="a movimentação"
        entityName={
          toDelete
            ? (toDelete.description?.trim() ?? '') !== ''
              ? (toDelete.description as string)
              : toDelete.kind === 'withdrawal'
                ? 'Saque'
                : 'Depósito'
            : undefined
        }
        hint="Se ela estiver num mês já rendido, os rendimentos serão recalculados."
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setToDelete(null)}
        isPending={deleteMovement.isPending}
      />
    </div>
  )
}
