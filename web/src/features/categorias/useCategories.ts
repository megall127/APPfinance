import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Category {
  id: string
  name: string
  color: string | null
  icon: string | null
  sortOrder: number
  /** May come back as 0/1 from the API */
  archived: boolean | number
}

export interface CreateCategoryPayload {
  name: string
  color?: string
  icon?: string
  sortOrder?: number
}

export type UpdateCategoryPayload = Partial<CreateCategoryPayload>

export interface DeleteCategoryResponse {
  archived: boolean
  deleted: boolean
}

// ── Keys ──────────────────────────────────────────────────────────────────────

export const CATEGORIES_KEY = ['categories'] as const

// ── useCategories ─────────────────────────────────────────────────────────────

export function useCategories() {
  return useQuery<Category[]>({
    queryKey: CATEGORIES_KEY,
    queryFn: async () => {
      const { data } = await api.get<Category[]>('/categories')
      return data
    },
  })
}

// ── useCreateCategory ─────────────────────────────────────────────────────────

export function useCreateCategory() {
  const qc = useQueryClient()
  return useMutation<Category, Error, CreateCategoryPayload>({
    mutationFn: async (payload) => {
      const { data } = await api.post<Category>('/categories', payload)
      return data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CATEGORIES_KEY })
    },
  })
}

// ── useUpdateCategory ─────────────────────────────────────────────────────────

export interface UpdateCategoryVars {
  id: string
  payload: UpdateCategoryPayload
}

export function useUpdateCategory() {
  const qc = useQueryClient()
  return useMutation<Category, Error, UpdateCategoryVars>({
    mutationFn: async ({ id, payload }) => {
      const { data } = await api.patch<Category>(`/categories/${id}`, payload)
      return data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CATEGORIES_KEY })
    },
  })
}

// ── useDeleteCategory ─────────────────────────────────────────────────────────

export function useDeleteCategory() {
  const qc = useQueryClient()
  return useMutation<DeleteCategoryResponse, Error, string>({
    mutationFn: async (id) => {
      const { data } = await api.delete<DeleteCategoryResponse>(
        `/categories/${id}`,
      )
      return data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CATEGORIES_KEY })
      void qc.invalidateQueries({ queryKey: ['items'] })
    },
  })
}
