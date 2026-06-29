import { Fragment, useState, useMemo } from 'react'
import { MonthYearPicker } from '@/features/dashboard/MonthYearPicker'
import { useCategories } from '@/features/categorias/useCategories'
import { useEntries } from './useEntries'
import { EntryRow } from './EntryRow'
import { computeMonthSummary } from './math'
import { formatBRL, MONTHS_PT } from '@/lib/format'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { EntryRow as EntryRowData } from './useEntries'

// ── Footer summary ────────────────────────────────────────────────────────────

interface SummaryFooterProps {
  rows: EntryRowData[]
}

function SummaryFooter({ rows }: SummaryFooterProps) {
  const { total, pago, falta } = useMemo(
    () => computeMonthSummary(rows),
    [rows],
  )

  return (
    <div className="mt-4 flex flex-wrap gap-4 justify-end text-sm">
      <div className="flex flex-col items-end">
        <span className="text-muted-foreground">Total do mês</span>
        <span className="font-semibold tabular-nums">{formatBRL(total)}</span>
      </div>
      <div className="flex flex-col items-end">
        <span className="text-green-700 dark:text-green-400">Já pago</span>
        <span className="font-semibold tabular-nums text-green-700 dark:text-green-400">
          {formatBRL(pago)}
        </span>
      </div>
      <div className="flex flex-col items-end">
        <span className="text-yellow-700 dark:text-yellow-400">Falta pagar</span>
        <span className="font-semibold tabular-nums text-yellow-700 dark:text-yellow-400">
          {formatBRL(falta)}
        </span>
      </div>
    </div>
  )
}

// ── Skeleton loader ───────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full rounded-md" />
      ))}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LancamentosPage() {
  const [year, setYear] = useState(() => new Date().getFullYear())
  // 1-based month
  const [month, setMonth] = useState(() => new Date().getMonth() + 1)

  const { data: rows, isLoading, isError } = useEntries(year, month)
  const { data: categories } = useCategories()

  // The entries endpoint returns items with `categoryId` only (no name/color),
  // so resolve the category from the workspace's categories list. Ids arrive as
  // numbers at runtime, so key by String() for a reliable match.
  const categoryById = useMemo(() => {
    const m = new Map<string, { name: string; color: string }>()
    for (const c of categories ?? []) {
      m.set(String(c.id), { name: c.name, color: c.color ?? '#94a3b8' })
    }
    return m
  }, [categories])

  // Group by category for display, preserving the category id for stable keys.
  const grouped = useMemo(() => {
    if (!rows) return []
    const map = new Map<string, { label: string; color: string; rows: EntryRowData[] }>()
    for (const row of rows) {
      const rawCat = row.item.categoryId
      const catId = rawCat != null && rawCat !== '' ? String(rawCat) : '__none__'
      const cat = categoryById.get(catId)
      const label = cat?.name ?? 'Sem categoria'
      const color = cat?.color ?? '#94a3b8'
      if (!map.has(catId)) {
        map.set(catId, { label, color, rows: [] })
      }
      map.get(catId)!.rows.push(row)
    }
    return Array.from(map.entries()).map(([catId, group]) => ({
      catId,
      ...group,
    }))
  }, [rows, categoryById])

  const monthLabel = MONTHS_PT[month - 1]

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Lançamentos
          </h1>
          <p className="text-sm text-muted-foreground">
            {monthLabel} {year} — itens do mês com valores e status de pagamento
          </p>
        </div>
        <MonthYearPicker
          year={year}
          month={month}
          onYearChange={setYear}
          onMonthChange={setMonth}
        />
      </div>

      {/* ── Main card ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">
            Itens de {monthLabel} {year}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <TableSkeleton />}

          {isError && (
            <p className="text-destructive text-sm py-4 text-center">
              Erro ao carregar lançamentos. Tente novamente.
            </p>
          )}

          {!isLoading && !isError && rows && rows.length === 0 && (
            <p className="text-muted-foreground text-sm py-8 text-center">
              Nenhum item ativo encontrado para este período.
            </p>
          )}

          {!isLoading && !isError && grouped.length > 0 && (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Valor (R$)</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {grouped.map((group) => (
                      <Fragment key={group.catId}>
                        {/* Category group header */}
                        <TableRow
                          className="hover:bg-transparent border-b-0"
                        >
                          <TableCell
                            colSpan={3}
                            className="pt-4 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                          >
                            <span
                              className="inline-flex items-center gap-1.5"
                            >
                              <span
                                className="inline-block w-2 h-2 rounded-full"
                                style={{ backgroundColor: group.color }}
                              />
                              {group.label}
                            </span>
                          </TableCell>
                        </TableRow>

                        {/* Entry rows for this category */}
                        {group.rows.map((row) => (
                          <EntryRow
                            key={row.item.id}
                            row={row}
                            year={year}
                            month={month}
                          />
                        ))}
                      </Fragment>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* ── Footer summary ── */}
              <SummaryFooter rows={rows ?? []} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
