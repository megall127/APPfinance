import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface YearPreview {
  year: number
  itemCount: number
  entryCount: number
}

export interface PreviewResult {
  years: YearPreview[]
}

export interface CommitResult {
  items?: number
  entries?: number
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFormData(file: File): FormData {
  const fd = new FormData()
  fd.append('file', file)
  return fd
}

// ── usePreview ────────────────────────────────────────────────────────────────

/**
 * Sends the xlsx file to /import/preview and returns a year-by-year summary
 * without persisting anything.
 */
export function usePreview() {
  return useMutation<PreviewResult, Error, File>({
    mutationFn: async (file: File) => {
      const { data } = await api.post<PreviewResult>(
        '/import/preview',
        makeFormData(file),
      )
      return data
    },
  })
}

// ── useCommit ─────────────────────────────────────────────────────────────────

/**
 * Commits the xlsx import. Invalidates all affected queries on success and
 * shows a success toast.
 */
export function useCommit() {
  const qc = useQueryClient()

  return useMutation<CommitResult, Error, File>({
    mutationFn: async (file: File) => {
      const { data } = await api.post<CommitResult>(
        '/import/commit',
        makeFormData(file),
      )
      return data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['entries'] })
      void qc.invalidateQueries({ queryKey: ['dashboard'] })
      void qc.invalidateQueries({ queryKey: ['dashboard-yearly'] })
      void qc.invalidateQueries({ queryKey: ['items'] })
      void qc.invalidateQueries({ queryKey: ['categories'] })
      toast.success('Planilha importada com sucesso!')
    },
  })
}
