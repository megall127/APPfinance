import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import { GuardadoPanel } from './GuardadoPanel'
import type { ReserveSummary } from '@/features/reservas/useReserves'

// O painel só rotula "parcial · até hoje" no mês corrente, então a fixture
// acompanha o relógio em vez de cravar uma competência que envelhece.
const hoje = new Date()

const base = {
  year: hoje.getFullYear(),
  month: hoje.getMonth() + 1,
  totalGuardado: 12864.28,
  totalPrincipal: 12500,
  totalRendimento: 364.28,
  rendimentoParcialDoMes: 101.19,
  rendimentoPrevistoDoMes: 150.47,
  rendimentoDoMesAnterior: 145.89,
  rendimentoNoAno: 364.28,
  contasAtivas: 1,
  metaTotal: 30000,
  metaProgresso: 0.4288,
  porConta: [],
  evolucao12m: [],
  apuracao: { pendente: false },
} as unknown as ReserveSummary

function renderPanel(data: ReserveSummary | undefined, isLoading = false) {
  return render(
    <MemoryRouter>
      <GuardadoPanel data={data} isLoading={isLoading} />
    </MemoryRouter>,
  )
}

describe('GuardadoPanel', () => {
  it('mostra o total guardado e o anel da meta em 43%', () => {
    renderPanel(base)
    expect(screen.getByText('R$ 12.864,28')).toBeInTheDocument()
    // metaProgresso é FRAÇÃO 0..1; o ProgressRing espera 0..100.
    expect(screen.getByText('43%')).toBeInTheDocument()
  })

  it('rotula o rendimento do mês como parcial', () => {
    renderPanel(base)
    expect(screen.getByText('Rendeu R$ 101,19 este mês')).toBeInTheDocument()
    expect(screen.getByText('parcial · até hoje')).toBeInTheDocument()
  })

  it('sem caixinhas, renderiza estado vazio textual (nunca null)', () => {
    const { container } = renderPanel({
      ...base,
      contasAtivas: 0,
    } as ReserveSummary)
    // Um painel null continuaria ocupando um CarouselItem E um dot,
    // deixando um slide em branco no mobile.
    expect(container.firstChild).not.toBeNull()
    expect(screen.getByText('Nenhuma caixinha ainda')).toBeInTheDocument()
    expect(screen.getByText('Criar a primeira')).toBeInTheDocument()
  })

  it('erro de rede não vira "nenhuma caixinha"', () => {
    // Dizer "crie a primeira" a quem tem R$ 12 mil guardados faz a família
    // achar que perdeu o dinheiro.
    render(
      <MemoryRouter>
        <GuardadoPanel data={undefined} isLoading={false} isError />
      </MemoryRouter>,
    )
    expect(
      screen.getByText('Não deu para carregar suas reservas'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Nenhuma caixinha ainda')).toBeNull()
  })

  it('mês passado não é rotulado como "este mês" nem como parcial', () => {
    const anterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)
    renderPanel({
      ...base,
      year: anterior.getFullYear(),
      month: anterior.getMonth() + 1,
      evolucao12m: [
        {
          year: anterior.getFullYear(),
          month: anterior.getMonth() + 1,
          saldoFinal: 11364.28,
          rendimento: 145.89,
          aportes: 0,
          saques: 0,
        },
      ],
    } as unknown as ReserveSummary)

    expect(screen.getByText(/Rendeu R\$ 145,89 em /)).toBeInTheDocument()
    expect(screen.queryByText('parcial · até hoje')).toBeNull()
  })

  it('sem meta, troca o anel pelo rendimento do ano', () => {
    renderPanel({
      ...base,
      metaProgresso: null,
      metaTotal: null,
    } as ReserveSummary)
    expect(screen.getByText('Rendimento no ano')).toBeInTheDocument()
    expect(screen.getByText('R$ 364,28')).toBeInTheDocument()
  })

  it('mostra skeleton enquanto carrega', () => {
    const { container } = renderPanel(undefined, true)
    expect(container.querySelector('.animate-pulse')).not.toBeNull()
  })
})
