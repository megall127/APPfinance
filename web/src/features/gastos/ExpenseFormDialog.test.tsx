import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ExpenseFormDialog } from './ExpenseFormDialog'
import type { VariableExpense } from './useVariableExpenses'

/**
 * Mock do axios da app.
 *
 * `vi.hoisted` é obrigatório: o `vi.mock` abaixo é içado para o topo do arquivo,
 * antes de qualquer `const`, e referenciar os spies direto daria TDZ.
 *
 * Os parâmetros dos spies são declarados de propósito: sem eles o TS tipa
 * `mock.calls[n]` como tupla vazia e `calls[0][1]` — o corpo enviado, que é
 * justamente o que estes testes inspecionam — não compila.
 */
const { patch, post, del } = vi.hoisted(() => ({
  patch: vi.fn((_url: string, _body?: Record<string, unknown>) =>
    Promise.resolve({ data: {} }),
  ),
  post: vi.fn((_url: string, _body?: Record<string, unknown>) =>
    Promise.resolve({ data: {} }),
  ),
  del: vi.fn((_url: string) => Promise.resolve({ data: { deleted: true } })),
}))

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: [] })),
    post,
    patch,
    delete: del,
  },
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function renderDialog(
  expense: VariableExpense | null,
  periodo: { year: number; month: number } = { year: 2026, month: 8 },
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ExpenseFormDialog
        open
        onOpenChange={() => {}}
        expense={expense}
        year={periodo.year}
        month={periodo.month}
      />
    </QueryClientProvider>,
  )
}

describe('ExpenseFormDialog', () => {
  beforeEach(() => {
    patch.mockClear()
    post.mockClear()
  })

  it('salva a edição de um gasto que TEM categoria (categoryId numérico)', async () => {
    // Regressão: o form declara categoryId como z.string(); a API entrega NÚMERO.
    // Sem String() no reset, o zodResolver falhava com invalid_type, o
    // handleSubmit nunca disparava e o botão Salvar virava um clique morto —
    // sem erro na tela, sem toast, sem requisição.
    const user = userEvent.setup()
    renderDialog({
      id: '12',
      amount: '32.50',
      spentOn: '2026-08-04',
      description: 'Almoço',
      categoryId: 7,
    })

    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1))
    expect(patch.mock.calls[0][0]).toBe('/variable-expenses/12')
  })

  it('apagar a descrição manda null, para o PATCH realmente limpar', async () => {
    // Regressão: string vazia virava undefined, o JSON.stringify removia a chave
    // do corpo e o service mantinha o texto antigo.
    const user = userEvent.setup()
    renderDialog({
      id: '12',
      amount: '32.50',
      spentOn: '2026-08-04',
      description: 'Almoço',
      categoryId: null,
    })

    await user.clear(screen.getByLabelText('O que foi'))
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1))
    expect(patch.mock.calls[0][1]?.description).toBeNull()
  })

  it('na criação, descrição vazia vai como undefined (o validator não é nullable)', async () => {
    const user = userEvent.setup()
    renderDialog(null)

    await user.type(screen.getByLabelText('Valor'), '32,50')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    const corpo = post.mock.calls[0][1]
    expect(corpo?.description).toBeUndefined()
    expect(corpo?.amount).toBe(32.5)
  })

  it('aceita valor no formato brasileiro com milhar', async () => {
    const user = userEvent.setup()
    renderDialog(null)

    await user.type(screen.getByLabelText('Valor'), '1.234,56')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(post.mock.calls[0][1]?.amount).toBe(1234.56)
  })

  it('na criação, a data cai no mês exibido — não em hoje', async () => {
    // Regressão: o campo nascia em todayISO() ignorando o mês da página. Lançar
    // um gasto olhando um mês passado gravava em HOJE: a linha piscava na lista
    // (update otimista), sumia, e o total do MÊS CORRENTE subia no dashboard.
    const user = userEvent.setup()
    renderDialog(null, { year: 2020, month: 7 })

    await user.type(screen.getByLabelText('Valor'), '50,00')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(post.mock.calls[0][1]?.spentOn).toBe('2020-07-01')
  })

  it('não envia nada quando o valor está vazio', async () => {
    const user = userEvent.setup()
    renderDialog(null)

    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(screen.getByText('Informe o valor')).toBeInTheDocument())
    expect(post).not.toHaveBeenCalled()
  })
})
