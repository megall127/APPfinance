import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'

// ── Types ────────────────────────────────────────────────────────────────────

export interface VariableExpense {
  id: string
  /** Vem da coluna decimal — STRING, ex.: "32.50" */
  amount: string
  /** 'YYYY-MM-DD' */
  spentOn: string
  description: string | null
  /**
   * NÚMERO em runtime, apesar de a coluna ser BIGINT: o Lucid serializa assim.
   * Declarar `string | null` aqui era mentira e já causou dois bugs — sempre
   * passe por String() antes de comparar ou indexar.
   */
  categoryId: string | number | null
}

export interface CategoryTotal {
  categoryId: number | null
  name: string | null
  color: string | null
  total: number
}

export interface MonthView {
  total: number
  count: number
  average: number
  byCategory: CategoryTotal[]
  expenses: VariableExpense[]
}

export interface ExpensePayload {
  amount: number
  spentOn: string
  /**
   * `null` LIMPA a descrição; `undefined` deixa como está. A diferença importa:
   * o JSON.stringify do axios remove chaves undefined do corpo, e o PATCH da API
   * só altera o que recebe. Mandar undefined ao apagar o campo não apagava nada.
   */
  description?: string | null
  categoryId?: number | null
}

/** Id temporário da linha criada otimisticamente, antes do servidor responder. */
export const OPTIMISTIC_ID = '__optimistic__'

// ── Query key ────────────────────────────────────────────────────────────────

export const expensesKey = (year: number, month: number) =>
  ['variable-expenses', year, month] as const

/** 'YYYY-MM-DD' → { year, month } (mês 1-based). */
function periodOf(iso: string): { year: number; month: number } {
  return { year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) }
}

/** Soma uma lista de gastos em centavos inteiros e devolve reais. */
function sumExpenses(expenses: VariableExpense[]): number {
  let cents = 0
  for (const expense of expenses) cents += Math.round(Number(expense.amount) * 100)
  return cents / 100
}

/** Recalcula total/count/average a partir da lista, para o cache otimista. */
function withTotals(view: MonthView, expenses: VariableExpense[]): MonthView {
  const total = sumExpenses(expenses)
  const count = expenses.length
  return {
    ...view,
    total,
    count,
    average: count > 0 ? Math.round((total / count) * 100) / 100 : 0,
    expenses,
  }
}

// ── useVariableExpenses ──────────────────────────────────────────────────────

export function useVariableExpenses(year: number, month: number) {
  return useQuery<MonthView>({
    queryKey: expensesKey(year, month),
    queryFn: async () => {
      const { data } = await api.get<MonthView>('/variable-expenses', {
        params: { year, month },
      })
      return data
    },
  })
}

// ── Invalidação compartilhada ────────────────────────────────────────────────

/**
 * Tudo que um gasto afeta. `periods` traz os pares (ano, mês) tocados pela
 * operação — normalmente um só, mas DOIS quando a edição moveu a data de mês.
 * Sem invalidar o mês antigo, a tela de Lançamentos dele fica com um total
 * defasado até um F5.
 */
function invalidateAll(
  qc: ReturnType<typeof useQueryClient>,
  periods: Array<{ year: number; month: number }>,
) {
  const seen = new Set<string>()
  for (const { year, month } of periods) {
    const key = `${year}-${month}`
    if (seen.has(key)) continue
    seen.add(key)
    void qc.invalidateQueries({ queryKey: expensesKey(year, month) })
    void qc.invalidateQueries({ queryKey: ['entries', year, month] })
  }
  void qc.invalidateQueries({ queryKey: ['dashboard'] })
  void qc.invalidateQueries({ queryKey: ['dashboard-yearly'] })
  void qc.invalidateQueries({ queryKey: ['items'] })
}

interface MutationContext {
  previous?: MonthView
}

// ── useCreateExpense ─────────────────────────────────────────────────────────

export function useCreateExpense(year: number, month: number) {
  const qc = useQueryClient()
  const key = expensesKey(year, month)

  return useMutation<VariableExpense, Error, ExpensePayload, MutationContext>({
    mutationFn: async (payload) => {
      const { data } = await api.post<VariableExpense>('/variable-expenses', payload)
      return data
    },

    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<MonthView>(key)

      qc.setQueryData<MonthView>(key, (old) => {
        if (!old) return old
        const optimistic: VariableExpense = {
          id: OPTIMISTIC_ID,
          amount: payload.amount.toFixed(2),
          spentOn: payload.spentOn,
          description: payload.description ?? null,
          categoryId: payload.categoryId != null ? String(payload.categoryId) : null,
        }
        // Ordenação da API: spentOn desc, id desc — a linha nova entra no topo
        // do seu dia, e o groupByDay reordena os dias por conta própria.
        return withTotals(old, [optimistic, ...old.expenses])
      })

      return { previous }
    },

    onError: (_err, _payload, context) => {
      if (context?.previous !== undefined) qc.setQueryData(key, context.previous)
    },

    onSettled: (_data, _err, payload) => {
      invalidateAll(qc, [{ year, month }, periodOf(payload.spentOn)])
    },
  })
}

// ── useUpdateExpense ─────────────────────────────────────────────────────────

export interface UpdateExpenseArgs {
  id: string
  /** Data que o gasto tinha ANTES da edição — o mês dela também precisa recarregar. */
  previousSpentOn: string
  payload: Partial<ExpensePayload>
}

export function useUpdateExpense(year: number, month: number) {
  const qc = useQueryClient()
  const key = expensesKey(year, month)

  return useMutation<VariableExpense, Error, UpdateExpenseArgs, MutationContext>({
    mutationFn: async ({ id, payload }) => {
      const { data } = await api.patch<VariableExpense>(`/variable-expenses/${id}`, payload)
      return data
    },

    onMutate: async ({ id, payload }) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<MonthView>(key)

      qc.setQueryData<MonthView>(key, (old) => {
        if (!old) return old
        const expenses = old.expenses.map((expense) =>
          expense.id === id
            ? {
                ...expense,
                amount: payload.amount !== undefined ? payload.amount.toFixed(2) : expense.amount,
                spentOn: payload.spentOn ?? expense.spentOn,
                description:
                  payload.description !== undefined ? payload.description : expense.description,
                categoryId:
                  payload.categoryId !== undefined
                    ? payload.categoryId != null
                      ? String(payload.categoryId)
                      : null
                    : expense.categoryId,
              }
            : expense,
        )
        return withTotals(old, expenses)
      })

      return { previous }
    },

    onError: (_err, _args, context) => {
      if (context?.previous !== undefined) qc.setQueryData(key, context.previous)
    },

    onSettled: (_data, _err, args) => {
      const periods = [{ year, month }, periodOf(args.previousSpentOn)]
      if (args.payload.spentOn !== undefined) periods.push(periodOf(args.payload.spentOn))
      invalidateAll(qc, periods)
    },
  })
}

// ── useDeleteExpense ─────────────────────────────────────────────────────────

export interface DeleteExpenseArgs {
  id: string
  spentOn: string
}

export function useDeleteExpense(year: number, month: number) {
  const qc = useQueryClient()
  const key = expensesKey(year, month)

  return useMutation<{ deleted: boolean }, Error, DeleteExpenseArgs, MutationContext>({
    mutationFn: async ({ id }) => {
      const { data } = await api.delete<{ deleted: boolean }>(`/variable-expenses/${id}`)
      return data
    },

    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<MonthView>(key)

      qc.setQueryData<MonthView>(key, (old) => {
        if (!old) return old
        return withTotals(
          old,
          old.expenses.filter((expense) => expense.id !== id),
        )
      })

      return { previous }
    },

    onError: (_err, _args, context) => {
      if (context?.previous !== undefined) qc.setQueryData(key, context.previous)
    },

    onSettled: (_data, _err, args) => {
      invalidateAll(qc, [{ year, month }, periodOf(args.spentOn)])
    },
  })
}
