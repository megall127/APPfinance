import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'

// ── Types ────────────────────────────────────────────────────────────────────

export type ItemKind = 'expense' | 'income' | 'card'

export interface EntryItem {
  id: string
  name: string
  kind: ItemKind
  categoryId: string
  categoryName?: string
  categoryColor?: string
  /** Item's saved default amount (decimal string) or null — shown as a suggestion in the grid. */
  defaultAmount?: string | null
  /** Installment fields (when the item is parcelado): total and how many already paid. */
  installmentsTotal?: number | null
  installmentsPaid?: number | null
}

export interface Entry {
  id: string
  itemId: string
  year: number
  month: number
  /** amount comes as a STRING from the API, e.g. "264.60" */
  amount: string
  status: 'paid' | 'pending'
  paidAt: string | null
  note: string | null
}

export interface EntryRow {
  item: EntryItem
  entry: Entry | null
}

// ── Query key factory ────────────────────────────────────────────────────────

const entriesKey = (year: number, month: number) =>
  ['entries', year, month] as const

// ── useEntries ───────────────────────────────────────────────────────────────

export function useEntries(year: number, month: number) {
  return useQuery<EntryRow[]>({
    queryKey: entriesKey(year, month),
    queryFn: async () => {
      const { data } = await api.get<EntryRow[]>('/entries', {
        params: { year, month },
      })
      return data
    },
  })
}

// ── useUpsertEntry ───────────────────────────────────────────────────────────

interface UpsertPayload {
  itemId: string
  year: number
  month: number
  /** Send as a plain number */
  amount: number
  status?: 'paid' | 'pending'
  note?: string
}

/** Optimistic-update context shared by both mutations. */
interface MutationContext {
  previous?: EntryRow[]
}

export function useUpsertEntry(year: number, month: number) {
  const qc = useQueryClient()
  const key = entriesKey(year, month)

  return useMutation<Entry, Error, UpsertPayload, MutationContext>({
    mutationFn: async (payload) => {
      const { data } = await api.post<Entry>('/entries/upsert', payload)
      return data
    },

    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<EntryRow[]>(key)

      qc.setQueryData<EntryRow[]>(key, (old) => {
        if (!old) return old
        return old.map((row) => {
          if (row.item.id !== payload.itemId) return row
          const prevEntry = row.entry
          const optimisticEntry: Entry = {
            id: prevEntry?.id ?? '__optimistic__',
            itemId: payload.itemId,
            year: payload.year,
            month: payload.month,
            // Store as string to match API shape
            amount: String(payload.amount),
            status: payload.status ?? prevEntry?.status ?? 'pending',
            paidAt: prevEntry?.paidAt ?? null,
            note: payload.note ?? prevEntry?.note ?? null,
          }
          return { ...row, entry: optimisticEntry }
        })
      })

      return { previous }
    },

    onError: (_err, _payload, context) => {
      if (context?.previous !== undefined) {
        qc.setQueryData(key, context.previous)
      }
    },

    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key })
    },

    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['dashboard'] })
      void qc.invalidateQueries({ queryKey: ['dashboard-yearly'] })
      void qc.invalidateQueries({ queryKey: ['items'] })
    },
  })
}

// ── useTogglePaid ────────────────────────────────────────────────────────────

interface TogglePayload {
  entryId: string
  itemId: string
}

export function useTogglePaid(year: number, month: number) {
  const qc = useQueryClient()
  const key = entriesKey(year, month)

  return useMutation<Entry, Error, TogglePayload, MutationContext>({
    mutationFn: async ({ entryId }) => {
      const { data } = await api.post<Entry>(`/entries/${entryId}/toggle-paid`)
      return data
    },

    onMutate: async ({ itemId }) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<EntryRow[]>(key)

      qc.setQueryData<EntryRow[]>(key, (old) => {
        if (!old) return old
        return old.map((row) => {
          if (row.item.id !== itemId || !row.entry) return row
          const flipped: 'paid' | 'pending' =
            row.entry.status === 'paid' ? 'pending' : 'paid'
          return {
            ...row,
            entry: {
              ...row.entry,
              status: flipped,
              paidAt: flipped === 'paid' ? new Date().toISOString() : null,
            },
          }
        })
      })

      return { previous }
    },

    onError: (_err, _payload, context) => {
      if (context?.previous !== undefined) {
        qc.setQueryData(key, context.previous)
      }
    },

    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key })
    },

    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['dashboard'] })
      void qc.invalidateQueries({ queryKey: ['dashboard-yearly'] })
      void qc.invalidateQueries({ queryKey: ['items'] })
    },
  })
}
