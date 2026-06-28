import { useState, useMemo } from 'react'
import { MonthYearPicker } from '@/features/dashboard/MonthYearPicker'
import { useEntries } from './useEntries'
import { EntryRow } from './EntryRow'
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
  const { total, paid } = useMemo(() => {
    let total = 0
    let paid = 0
    for (const { item, entry } of rows) {
      if (item.kind !== 'expense' || !entry) continue
      const amount = Number(entry.amount)
      total += amount
      if (entry.status === 'paid') paid += amount
    }
    return { total, paid }
  }, [rows])

  const falta = total - paid

  return (
    <div className="mt-4 flex flex-wrap gap-4 justify-end text-sm">
      <div className="flex flex-col items-end">
        <span className="text-muted-foreground">Total do mês</span>
        <span className="font-semibold tabular-nums">{formatBRL(total)}</span>
      </div>
      <div className="flex flex-col items-end">
        <span className="text-green-700 dark:text-green-400">Já pago</span>
        <span className="font-semibold tabular-nums text-green-700 dark:text-green-400">
          {formatBRL(paid)}
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

  // Group by category for display
  const grouped = useMemo(() => {
    if (!rows) return []
    const map = new Map<string, { label: string; color: string; rows: EntryRowData[] }>()
    for (const row of rows) {
      const catId = row.item.categoryId ?? '__none__'
      const catName = row.item.categoryName ?? 'Sem categoria'
      const catColor = row.item.categoryColor ?? '#94a3b8'
      if (!map.has(catId)) {
        map.set(catId, { label: catName, color: catColor, rows: [] })
      }
      map.get(catId)!.rows.push(row)
    }
    return Array.from(map.values())
  }, [rows])

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
                      <>
                        {/* Category group header */}
                        <TableRow
                          key={`group-${group.label}`}
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
                      </>
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
