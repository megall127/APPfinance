import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { MonthYearPicker } from '@/features/dashboard/MonthYearPicker'
import { useCategories } from '@/features/categorias/useCategories'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatBRL, MONTHS_PT } from '@/lib/format'
import { CategorySummary } from './CategorySummary'
import { DayGroup } from './DayGroup'
import { ExpenseFormDialog } from './ExpenseFormDialog'
import { groupByDay } from './grouping'
import {
  OPTIMISTIC_ID,
  useVariableExpenses,
  type VariableExpense,
} from './useVariableExpenses'

export default function GastosPage() {
  const [year, setYear] = useState(() => new Date().getFullYear())
  // 1-based month
  const [month, setMonth] = useState(() => new Date().getMonth() + 1)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<VariableExpense | null>(null)

  const { data, isLoading, isError } = useVariableExpenses(year, month)
  const { data: categories } = useCategories()

  // Ids chegam como número em runtime, então indexa por String() para casar
  // com o categoryId serializado do gasto.
  const categoryById = useMemo(() => {
    const map = new Map<string, { name: string; color: string }>()
    for (const category of categories ?? []) {
      map.set(String(category.id), { name: category.name, color: category.color ?? '#94a3b8' })
    }
    return map
  }, [categories])

  const groups = useMemo(() => groupByDay(data?.expenses ?? []), [data])
  // Fixado uma vez por montagem: o rótulo do dia não precisa mudar sozinho.
  const today = useMemo(() => new Date(), [])
  const monthLabel = MONTHS_PT[month - 1]

  function openNew() {
    setEditing(null)
    setDialogOpen(true)
  }

  function openEdit(expense: VariableExpense) {
    // Uma linha otimista ainda não existe no servidor — editá-la daria 404.
    if (expense.id === OPTIMISTIC_ID) return
    setEditing(expense)
    setDialogOpen(true)
  }

  return (
    <div className="space-y-6 pb-24 lg:pb-0">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Gastos</h1>
          <p className="text-sm text-muted-foreground">
            {monthLabel} {year} — o que você gastou na rua, fora dos gastos fixos
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MonthYearPicker
            year={year}
            month={month}
            onYearChange={setYear}
            onMonthChange={setMonth}
          />
          <Button onClick={openNew} className="hidden lg:inline-flex">
            <Plus className="mr-1.5 h-4 w-4" />
            Novo gasto
          </Button>
        </div>
      </div>

      {/* ── Totais ── */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          {isLoading && (
            <div className="space-y-3">
              <Skeleton className="mx-auto h-10 w-48" />
              <Skeleton className="mx-auto h-4 w-64" />
            </div>
          )}

          {isError && (
            <p className="py-4 text-center text-sm text-destructive">
              Erro ao carregar os gastos. Tente novamente.
            </p>
          )}

          {!isLoading && !isError && data && (
            <>
              <div className="text-center">
                <p className="text-3xl font-bold tabular-nums text-foreground">
                  {formatBRL(data.total)}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {data.count === 1 ? '1 gasto' : `${data.count} gastos`}
                  {data.count > 0 && ` · média ${formatBRL(data.average)}`}
                </p>
              </div>
              <CategorySummary byCategory={data.byCategory} />
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Lista ── */}
      {!isLoading && !isError && data && (
        <Card>
          <CardContent className="space-y-5 pt-6">
            {groups.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhum gasto anotado em {monthLabel}. Toque em + para anotar o primeiro.
              </p>
            ) : (
              groups.map((group) => (
                <DayGroup
                  key={group.date}
                  group={group}
                  today={today}
                  categoryById={categoryById}
                  onSelect={openEdit}
                />
              ))
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Botão flutuante (mobile) ── */}
      <Button
        onClick={openNew}
        size="icon"
        aria-label="Novo gasto"
        className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full shadow-lg lg:hidden"
      >
        <Plus className="h-6 w-6" />
      </Button>

      <ExpenseFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        expense={editing}
        year={year}
        month={month}
      />
    </div>
  )
}
