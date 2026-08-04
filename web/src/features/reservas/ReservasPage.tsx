import { useState } from 'react'
import { ArrowDownUp, LineChart, PiggyBank, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog'
import {
  useCdi,
  useDeleteReserveAccount,
  useReserveAccounts,
  useReserveSummary,
  type ReserveAccount,
} from './useReserves'
import { TotalGuardadoHeader } from './TotalGuardadoHeader'
import { YieldCloseBanner } from './YieldCloseBanner'
import { ReserveAccountCard } from './ReserveAccountCard'
import { ReserveAccountFormDialog } from './ReserveAccountFormDialog'
import { MovementFormDialog } from './MovementFormDialog'
import { MovementsTab } from './MovementsTab'
import { AccountStatementDialog } from './AccountStatementDialog'
import { ReconcileDialog } from './ReconcileDialog'
import { CdiRateDialog } from './CdiRateDialog'
import { ProjectionSimulator } from './ProjectionSimulator'

// ── Tab config ────────────────────────────────────────────────────────────────

type TabValue = 'caixinhas' | 'movimentacoes' | 'simulador'

interface TabDef {
  value: TabValue
  label: string
  Icon: React.ComponentType<{ className?: string }>
}

const TABS: TabDef[] = [
  { value: 'caixinhas', label: 'Caixinhas', Icon: PiggyBank },
  { value: 'movimentacoes', label: 'Movimentações', Icon: ArrowDownUp },
  { value: 'simulador', label: 'Simulador', Icon: LineChart },
]

// ── Skeleton da lista de caixinhas ────────────────────────────────────────────

function AccountsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {Array.from({ length: 2 }).map((_, i) => (
        <Card key={i} className="rounded-2xl p-5 shadow-sm">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-3 h-7 w-32" />
          <Skeleton className="mt-4 h-2 w-full" />
          <Skeleton className="mt-4 h-8 w-48" />
        </Card>
      ))}
    </div>
  )
}

// ── Página ────────────────────────────────────────────────────────────────────

export default function ReservasPage() {
  // Ano atual e mês 1-based; inicializadores lazy (new Date() só uma vez).
  const [year] = useState(() => new Date().getFullYear())
  const [month] = useState(() => new Date().getMonth() + 1)

  const {
    data: summary,
    isLoading: summaryLoading,
    isError: summaryError,
  } = useReserveSummary(year, month)
  const {
    data: accounts,
    isLoading: accountsLoading,
    isError: accountsError,
  } = useReserveAccounts()
  const { data: cdi } = useCdi()

  const deleteAccount = useDeleteReserveAccount()

  const [tab, setTab] = useState<TabValue>('caixinhas')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ReserveAccount | undefined>(undefined)
  const [toDelete, setToDelete] = useState<ReserveAccount | null>(null)
  const [movementOpen, setMovementOpen] = useState(false)
  const [movementAccountId, setMovementAccountId] = useState<
    string | undefined
  >(undefined)
  const [statementFor, setStatementFor] = useState<ReserveAccount | null>(null)
  const [reconcileFor, setReconcileFor] = useState<ReserveAccount | null>(null)
  const [cdiOpen, setCdiOpen] = useState(false)

  // A auto-atualização de rendimentos (§7.3) mora no <YieldCloseBanner/>, que é o
  // único dono da mutation: com uma instância aqui e outra lá, o disparo automático
  // e o botão manual viravam dois POST concorrentes e o botão ficava habilitado
  // durante o automático, porque cada instância só enxerga o próprio `isPending`.

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleAdd() {
    setEditing(undefined)
    setFormOpen(true)
  }

  function handleEdit(account: ReserveAccount) {
    setEditing(account)
    setFormOpen(true)
  }

  function handleMovement(account: ReserveAccount) {
    setMovementAccountId(String(account.id))
    setMovementOpen(true)
  }

  async function handleDeleteConfirm() {
    if (!toDelete) return
    try {
      const result = await deleteAccount.mutateAsync(toDelete.id)
      if (result.archived) {
        toast.success('Caixinha arquivada')
      } else {
        toast.success('Caixinha removida')
      }
    } catch {
      toast.error('Erro ao excluir caixinha. Tente novamente.')
    } finally {
      setToDelete(null)
    }
  }

  const activeAccounts = accounts ?? []

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Reservas
          </h1>
          <p className="text-sm text-muted-foreground">
            Suas caixinhas, o quanto elas rendem e quando você chega na meta
          </p>
        </div>
        <Button onClick={handleAdd} className="sm:self-start gap-2">
          <Plus className="h-4 w-4" />
          Nova caixinha
        </Button>
      </div>

      {/* ── Consolidado ── */}
      <TotalGuardadoHeader
        summary={summary}
        isLoading={summaryLoading}
        isError={summaryError}
        cdi={cdi?.vigenteHoje}
        onOpenCdi={() => setCdiOpen(true)}
      />

      {/* ── Banner de apuração ── */}
      <YieldCloseBanner summary={summary} />

      {/* ── Abas (controladas; painel renderizado FORA do <Tabs>) ── */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}>
        <TabsList>
          {TABS.map(({ value, label, Icon }) => (
            <TabsTrigger key={value} value={value}>
              <span className="flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5" />
                {label}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {tab === 'caixinhas' && (
        <>
          {accountsLoading && <AccountsSkeleton />}

          {accountsError && !accountsLoading && (
            <p className="py-6 text-center text-sm text-destructive">
              Erro ao carregar as caixinhas. Tente novamente.
            </p>
          )}

          {!accountsLoading && !accountsError && activeAccounts.length === 0 && (
            <div className="py-12 text-center text-muted-foreground">
              <p className="text-sm">Nenhuma caixinha ainda.</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={handleAdd}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Criar a primeira
              </Button>
            </div>
          )}

          {!accountsLoading && !accountsError && activeAccounts.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              {activeAccounts.map((account) => (
                <ReserveAccountCard
                  key={account.id}
                  account={account}
                  onEdit={handleEdit}
                  onDelete={setToDelete}
                  onMovement={handleMovement}
                  onStatement={setStatementFor}
                  onReconcile={setReconcileFor}
                />
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'movimentacoes' && <MovementsTab />}

      {tab === 'simulador' && <ProjectionSimulator />}

      {/* ── Diálogos ── */}
      <ReserveAccountFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        account={editing}
      />

      <MovementFormDialog
        open={movementOpen}
        onOpenChange={setMovementOpen}
        defaultAccountId={movementAccountId}
      />

      <AccountStatementDialog
        open={!!statementFor}
        onOpenChange={(open: boolean) => !open && setStatementFor(null)}
        account={statementFor}
      />

      <ReconcileDialog
        open={!!reconcileFor}
        onOpenChange={(open: boolean) => !open && setReconcileFor(null)}
        account={reconcileFor}
      />

      <CdiRateDialog open={cdiOpen} onOpenChange={setCdiOpen} />

      <DeleteConfirmDialog
        open={!!toDelete}
        entityLabel="a caixinha"
        entityName={toDelete?.name}
        hint="Se ela tiver movimentações, será arquivada em vez de excluída."
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setToDelete(null)}
        isPending={deleteAccount.isPending}
      />
    </div>
  )
}
