import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ItemKind = 'income' | 'expense' | 'card_subscription'

export interface Item {
  id: string
  name: string
  kind: ItemKind
  categoryId: string | null
  /** Comes as a decimal STRING from the API, e.g. "264.60" */
  defaultAmount: string | null
  /** May come back as 0/1 from the API */
  isActive: boolean | number
  sortOrder: number
}

export interface CreateItemPayload {
  name: string
  kind: ItemKind
  categoryId?: string
  /** Send as a number */
  defaultAmount?: number
  isActive?: boolean
  sortOrder?: number
}

export type UpdateItemPayload = Partial<CreateItemPayload>

export interface DeleteItemResponse {
  deactivated: boolean
  deleted: boolean
}

// ── Keys ──────────────────────────────────────────────────────────────────────

export const itemsKey = (kind?: ItemKind) =>
  ['items', kind ?? 'all'] as const

// ── useItems ──────────────────────────────────────────────────────────────────

export function useItems(kind?: ItemKind) {
  return useQuery<Item[]>({
    queryKey: itemsKey(kind),
    queryFn: async () => {
      const { data } = await api.get<Item[]>('/items', {
        params: kind ? { kind } : undefined,
      })
      return data
    },
  })
}

// ── useCreateItem ─────────────────────────────────────────────────────────────

export function useCreateItem() {
  const qc = useQueryClient()
  return useMutation<Item, Error, CreateItemPayload>({
    mutationFn: async (payload) => {
      const { data } = await api.post<Item>('/items', payload)
      return data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['items'] })
    },
  })
}

// ── useUpdateItem ─────────────────────────────────────────────────────────────

export interface UpdateItemVars {
  id: string
  payload: UpdateItemPayload
}

export function useUpdateItem() {
  const qc = useQueryClient()
  return useMutation<Item, Error, UpdateItemVars>({
    mutationFn: async ({ id, payload }) => {
      const { data } = await api.patch<Item>(`/items/${id}`, payload)
      return data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['items'] })
    },
  })
}

// ── useDeleteItem ─────────────────────────────────────────────────────────────

export function useDeleteItem() {
  const qc = useQueryClient()
  return useMutation<DeleteItemResponse, Error, string>({
    mutationFn: async (id) => {
      const { data } = await api.delete<DeleteItemResponse>(`/items/${id}`)
      return data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['items'] })
      void qc.invalidateQueries({ queryKey: ['entries'] })
      void qc.invalidateQueries({ queryKey: ['dashboard'] })
      void qc.invalidateQueries({ queryKey: ['dashboard-yearly'] })
    },
  })
}
