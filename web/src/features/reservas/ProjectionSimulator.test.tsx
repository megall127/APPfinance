import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import type { ProjectionPoint } from './interest'

// Sem QueryClientProvider (§8.3): a camada de dados é mockada. O simulador é
// 100% client-side, então o hook só serve para o pré-preenchimento.
vi.mock('@/features/reservas/useReserves', () => ({
  useReserveSummary: () => ({
    data: {
      year: 2026,
      month: 7,
      totalGuardado: 0,
      totalPrincipal: 0,
      totalRendimento: 0,
      rendimentoParcialDoMes: 0,
      rendimentoPrevistoDoMes: 0,
      rendimentoDoMesAnterior: 0,
      rendimentoNoAno: 0,
      contasAtivas: 0,
      metaTotal: null,
      metaProgresso: null,
      porConta: [],
      evolucao12m: [],
      apuracao: { pendente: false },
    },
    isLoading: false,
    isError: false,
  }),
  useReserveAccounts: () => ({ data: [], isLoading: false, isError: false }),
}))

// `ResponsiveContainer` mede 0×0 em jsdom e nunca desenha o SVG, então o stub
// expõe a MESMA curva em texto — é assim que se prova que o badge de meta e o
// gráfico saem do mesmo `projectMonths`.
vi.mock('./ProjectionChart', () => ({
  ProjectionChart: ({ points }: { points: ProjectionPoint[] }) => (
    <div
      data-testid="curva"
      data-saldos={points.map((p) => p.saldoCents).join(',')}
    />
  ),
}))

import { ProjectionSimulator } from './ProjectionSimulator'

// ── Helpers ───────────────────────────────────────────────────────────────────

function preencher(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

/** Saldo inicial 0, aporte R$ 1.000, 0,8% a.m. e 120 meses — o vetor V7/V7b. */
function cenarioV7(diaDoAporte: string) {
  render(<ProjectionSimulator />)
  preencher('Saldo inicial', '0')
  preencher('Aporte mensal', '1.000,00')
  preencher('Valor da taxa', '0,8')
  preencher('Dia do aporte', diaDoAporte)
  fireEvent.click(screen.getByRole('button', { name: '120 meses' }))
}

// ── Testes ────────────────────────────────────────────────────────────────────

describe('ProjectionSimulator', () => {
  it('120 meses, aporte de R$ 1.000 no dia 1 e 0,8% a.m. → R$ 201.819,30', async () => {
    cenarioV7('1')

    expect(await screen.findByText('R$ 201.819,30')).toBeInTheDocument()
    expect(screen.getByText('R$ 120.000,00')).toBeInTheDocument() // total aportado
    expect(screen.getByText('R$ 81.819,30')).toBeInTheDocument() // rendimento
  })

  it('trocar o dia do aporte para 10 muda o valor final para R$ 201.338,72', async () => {
    cenarioV7('10')

    expect(await screen.findByText('R$ 201.338,72')).toBeInTheDocument()
    expect(screen.queryByText('R$ 201.819,30')).not.toBeInTheDocument()
  })

  it('o dia do aporte é um campo visível, com o dia 1 como padrão', () => {
    render(<ProjectionSimulator />)
    expect(screen.getByLabelText('Dia do aporte')).toHaveValue(1)
  })

  it('o badge de meta e a curva do gráfico concordam no mesmo mês', async () => {
    cenarioV7('1')
    preencher('Meta (opcional)', '50.000,00')

    const badge = await screen.findByText(/Você atinge sua meta em/)
    const meses = Number(/\((\d+) meses\)/.exec(badge.textContent ?? '')?.[1])
    expect(meses).toBe(42)

    // Mesmo mês na curva: primeiro ponto em que o saldo alcança R$ 50.000.
    const saldos = (screen.getByTestId('curva').getAttribute('data-saldos') ?? '')
      .split(',')
      .map(Number)
    expect(saldos).toHaveLength(120)
    expect(saldos.findIndex((s) => s >= 5000000) + 1).toBe(meses)
  })

  it('sem taxa nem aporte, mostra zeros em vez de quebrar', () => {
    render(<ProjectionSimulator />)
    expect(screen.getAllByText('R$ 0,00').length).toBeGreaterThanOrEqual(3)
  })

  it('o gráfico sem pontos mostra estado vazio textual, nunca null', async () => {
    const { ProjectionChart } = await vi.importActual<
      typeof import('./ProjectionChart')
    >('./ProjectionChart')
    const { container } = render(<ProjectionChart points={[]} />)
    expect(
      screen.getByText('Informe um aporte e um prazo para ver a projeção'),
    ).toBeInTheDocument()
    expect(container.querySelector('.h-\\[300px\\]')).not.toBeNull()
  })
})
