# Dashboard em carrossel + Puxar-pra-atualizar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o dashboard num carrossel de 4 painéis "hero" (grade no desktop) e adicionar puxar-pra-atualizar em todas as telas do app web.

**Architecture:** Dois recursos independentes no `web/` (PWA). (1) Um primitivo de carrossel sem biblioteca (`scroll-snap` nativo → grade no `lg`) + painéis de apresentação, montados no `DashboardPage`. (2) Puxar-pra-atualizar com um único ponto de integração no `AppLayout`, cuja lógica de gesto é um reducer puro consumido por um hook, disparando `queryClient.refetchQueries({ type: 'active' })`.

**Tech Stack:** React 19 + TypeScript + Tailwind 4 + shadcn/ui + `@tanstack/react-query` + Recharts + Vitest/Testing Library. Sem novas dependências.

## Global Constraints

- **Sem novas dependências** (nenhum `npm install`). Usar `scroll-snap` nativo e eventos de toque próprios.
- **Sem mudanças de backend/API.** Apenas `web/`.
- **Sem dark mode.** Usar os tokens da marca já definidos em `web/src/index.css`: `--primary` (#4CAF82), `--primary-strong` (#2E8B63), `--secondary` (#F5C84C), `--destructive`/`--danger` (#E5534B), `--muted`, `--muted-foreground`, `--foreground`, `--card`.
- **Testes co-locados** (`*.test.ts` / `*.test.tsx` ao lado do arquivo). Imports explícitos de `describe/it/expect` do `vitest` (padrão do repo).
- **Rodar um arquivo de teste** (a partir da raiz do repo): `npm --prefix web run test -- <caminho relativo a web/>`.
- **Alias:** `@` → `web/src`.
- **Commit trailer (obrigatório):** toda mensagem de commit termina com estas duas linhas:
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01SbvRxKvyw5dGYdfq1Fv22q
  ```
- **Branch:** `feat/dashboard-carousel-pull-refresh` (já criada; o spec já foi commitado nela).

---

## File Structure

**Novos**
- `web/src/components/ui/carousel-utils.ts` — `activeIndexFromScroll` (pura, testável isoladamente).
- `web/src/components/ui/carousel.tsx` — `Carousel`, `CarouselItem`, `CarouselDots` (só componentes).
- `web/src/features/dashboard/ProgressRing.tsx` — anel de progresso SVG (extraído do `SummaryCards`).
- `web/src/features/dashboard/panels/ResumoPanel.tsx` — painel 1 (Total, Pago, Falta, % ring).
- `web/src/features/dashboard/panels/BalancoPanel.tsx` — painel 2 (Receitas, Saldo, Assinaturas).
- `web/src/hooks/pullToRefreshCore.ts` — constantes, helpers puros e reducer do gesto.
- `web/src/hooks/usePullToRefresh.ts` — hook que liga eventos de toque ao reducer + dispara refresh.
- `web/src/components/PullToRefresh.tsx` — wrapper de apresentação (scroller `<main>` + indicador).
- Testes: `carousel-utils.test.ts`, `carousel.test.tsx`, `ResumoPanel.test.tsx`, `BalancoPanel.test.tsx`, `DashboardPage.test.tsx`, `pullToRefreshCore.test.ts`, `usePullToRefresh.test.tsx`.

**Alterados**
- `web/src/features/dashboard/DashboardPage.tsx` — monta o carrossel/grade.
- `web/src/features/dashboard/YearlyEvolutionChart.tsx` / `CategoryBreakdownChart.tsx` — `h-full` no Card raiz.
- `web/src/app/AppLayout.tsx` — envolve o `<main>` com `PullToRefresh`.

**Removidos**
- `web/src/features/dashboard/SummaryCards.tsx` (conteúdo migrado; importado só pelo `DashboardPage`).

---

## Task 1: Primitivo de carrossel (utils + componentes)

**Files:**
- Create: `web/src/components/ui/carousel-utils.ts`
- Test: `web/src/components/ui/carousel-utils.test.ts`
- Create: `web/src/components/ui/carousel.tsx`
- Test: `web/src/components/ui/carousel.test.tsx`

**Interfaces:**
- Produces:
  - `activeIndexFromScroll(scrollLeft: number, scrollWidth: number, clientWidth: number, count: number): number`
  - `Carousel({ children: ReactNode, gridClassName?: string, className?: string }): JSX.Element`
  - `CarouselItem({ children: ReactNode, className?: string }): JSX.Element`
  - `CarouselDots({ count: number, active: number, onDotClick: (index: number) => void, className?: string }): JSX.Element | null`

- [ ] **Step 1: Escrever o teste do helper puro (falha)**

Create `web/src/components/ui/carousel-utils.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { activeIndexFromScroll } from './carousel-utils'

describe('activeIndexFromScroll', () => {
  it('mapeia a posição de scroll para o índice do painel', () => {
    // 4 painéis, viewport 400, conteúdo 1600 => maxScroll 1200, step 400
    expect(activeIndexFromScroll(0, 1600, 400, 4)).toBe(0)
    expect(activeIndexFromScroll(400, 1600, 400, 4)).toBe(1)
    expect(activeIndexFromScroll(600, 1600, 400, 4)).toBe(2) // 1.5 arredonda p/ 2
    expect(activeIndexFromScroll(1200, 1600, 400, 4)).toBe(3)
  })
  it('trava nos limites', () => {
    expect(activeIndexFromScroll(-50, 1600, 400, 4)).toBe(0)
    expect(activeIndexFromScroll(99999, 1600, 400, 4)).toBe(3)
  })
  it('retorna 0 sem espaço de scroll ou com item único', () => {
    expect(activeIndexFromScroll(0, 400, 400, 4)).toBe(0)
    expect(activeIndexFromScroll(0, 1600, 400, 1)).toBe(0)
  })
})
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npm --prefix web run test -- src/components/ui/carousel-utils.test.ts`
Expected: FAIL ("Failed to resolve import './carousel-utils'").

- [ ] **Step 3: Implementar o helper puro**

Create `web/src/components/ui/carousel-utils.ts`:

```ts
/**
 * Converte a posição de scroll horizontal no índice do painel ativo, assumindo
 * painéis de largura igual (full-width) com snap. Trava entre 0 e count-1.
 */
export function activeIndexFromScroll(
  scrollLeft: number,
  scrollWidth: number,
  clientWidth: number,
  count: number,
): number {
  if (count <= 1) return 0
  const maxScroll = scrollWidth - clientWidth
  if (maxScroll <= 0) return 0
  const step = maxScroll / (count - 1)
  const idx = Math.round(scrollLeft / step)
  return Math.min(count - 1, Math.max(0, idx))
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npm --prefix web run test -- src/components/ui/carousel-utils.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Escrever o teste dos componentes (falha)**

Create `web/src/components/ui/carousel.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Carousel, CarouselItem } from './carousel'

describe('Carousel', () => {
  beforeEach(() => {
    // jsdom não implementa Element.prototype.scrollTo
    Element.prototype.scrollTo = vi.fn() as unknown as typeof Element.prototype.scrollTo
  })

  it('renderiza um dot por item', () => {
    render(
      <Carousel>
        <CarouselItem>A</CarouselItem>
        <CarouselItem>B</CarouselItem>
        <CarouselItem>C</CarouselItem>
      </Carousel>,
    )
    expect(screen.getAllByRole('tab')).toHaveLength(3)
  })

  it('clicar num dot rola até o painel', () => {
    render(
      <Carousel>
        <CarouselItem>A</CarouselItem>
        <CarouselItem>B</CarouselItem>
      </Carousel>,
    )
    fireEvent.click(screen.getByLabelText('Ir para o painel 2'))
    expect(Element.prototype.scrollTo).toHaveBeenCalled()
  })
})
```

- [ ] **Step 6: Rodar o teste e ver falhar**

Run: `npm --prefix web run test -- src/components/ui/carousel.test.tsx`
Expected: FAIL ("Failed to resolve import './carousel'").

- [ ] **Step 7: Implementar os componentes**

Create `web/src/components/ui/carousel.tsx`:

```tsx
import {
  Children,
  useCallback,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { cn } from '@/lib/utils'
import { activeIndexFromScroll } from './carousel-utils'

interface CarouselProps {
  children: ReactNode
  /** Classes de grade aplicadas na faixa no desktop (ex.: "lg:grid-cols-2"). */
  gridClassName?: string
  className?: string
}

/**
 * Carrossel com snap horizontal no mobile que vira grade no `lg`.
 * Os dots ficam escondidos no desktop (`lg:hidden`), onde tudo aparece de uma vez.
 */
export function Carousel({ children, gridClassName, className }: CarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const count = Children.count(children)

  const handleScroll = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    setActive(activeIndexFromScroll(el.scrollLeft, el.scrollWidth, el.clientWidth, count))
  }, [count])

  const scrollToIndex = useCallback(
    (i: number) => {
      const el = trackRef.current
      if (!el) return
      const maxScroll = el.scrollWidth - el.clientWidth
      const step = count > 1 ? maxScroll / (count - 1) : 0
      el.scrollTo({ left: step * i, behavior: 'smooth' })
    },
    [count],
  )

  return (
    <div className={className}>
      <div
        ref={trackRef}
        onScroll={handleScroll}
        className={cn(
          'flex gap-4 overflow-x-auto snap-x snap-mandatory overscroll-x-contain scroll-smooth',
          '[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden',
          'lg:grid lg:gap-6 lg:overflow-visible',
          gridClassName,
        )}
      >
        {children}
      </div>
      <CarouselDots count={count} active={active} onDotClick={scrollToIndex} className="lg:hidden" />
    </div>
  )
}

export function CarouselItem({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('snap-center shrink-0 basis-full min-w-0 lg:basis-auto', className)}>
      {children}
    </div>
  )
}

interface CarouselDotsProps {
  count: number
  active: number
  onDotClick: (index: number) => void
  className?: string
}

export function CarouselDots({ count, active, onDotClick, className }: CarouselDotsProps) {
  if (count <= 1) return null
  return (
    <div
      role="tablist"
      aria-label="Navegação do dashboard"
      className={cn('mt-4 flex items-center justify-center gap-2', className)}
    >
      {Array.from({ length: count }).map((_, i) => (
        <button
          key={i}
          type="button"
          role="tab"
          aria-label={`Ir para o painel ${i + 1}`}
          aria-selected={i === active}
          onClick={() => onDotClick(i)}
          className={cn(
            'h-2 rounded-full transition-all duration-200',
            i === active ? 'w-5 bg-primary' : 'w-2 bg-muted-foreground/30',
          )}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 8: Rodar os testes e ver passar**

Run: `npm --prefix web run test -- src/components/ui/carousel`
Expected: PASS (carousel-utils.test.ts + carousel.test.tsx).

- [ ] **Step 9: Commit**

```bash
git add web/src/components/ui/carousel-utils.ts web/src/components/ui/carousel-utils.test.ts web/src/components/ui/carousel.tsx web/src/components/ui/carousel.test.tsx
git commit -F- <<'EOF'
feat(web): primitivo de carrossel com snap (grade no desktop)

Carousel/CarouselItem/CarouselDots sem dependencia, baseado em scroll-snap
nativo; helper puro activeIndexFromScroll testado isoladamente.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SbvRxKvyw5dGYdfq1Fv22q
EOF
```

---

## Task 2: ProgressRing + ResumoPanel (Painel 1)

**Files:**
- Create: `web/src/features/dashboard/ProgressRing.tsx`
- Create: `web/src/features/dashboard/panels/ResumoPanel.tsx`
- Test: `web/src/features/dashboard/panels/ResumoPanel.test.tsx`

**Interfaces:**
- Consumes: `DashboardData` de `web/src/features/dashboard/useDashboard.ts` (campos: `totalDoMes`, `jaPago`, `faltaPagar`, `percentualPago`, `receitas`, `saldo`, `assinaturasCartao`, `breakdownPorCategoria`); `formatBRL` de `@/lib/format`; `Card` de `@/components/ui/card`; `Skeleton` de `@/components/ui/skeleton`.
- Produces:
  - `ProgressRing({ pct: number, size?: number }): JSX.Element`
  - `ResumoPanel({ data: DashboardData | undefined, isLoading: boolean }): JSX.Element | null`

- [ ] **Step 1: Escrever o teste do ResumoPanel (falha)**

Create `web/src/features/dashboard/panels/ResumoPanel.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ResumoPanel } from './ResumoPanel'
import type { DashboardData } from '../useDashboard'

const sample: DashboardData = {
  totalDoMes: 4200,
  jaPago: 3100,
  faltaPagar: 1100,
  percentualPago: 0.74,
  receitas: 5300,
  saldo: 1100,
  assinaturasCartao: 320,
  breakdownPorCategoria: [],
}

describe('ResumoPanel', () => {
  it('mostra total, pago, falta e % pago', () => {
    render(<ResumoPanel data={sample} isLoading={false} />)
    expect(screen.getByText('R$ 4.200,00')).toBeInTheDocument()
    expect(screen.getByText('R$ 3.100,00')).toBeInTheDocument()
    expect(screen.getByText('R$ 1.100,00')).toBeInTheDocument()
    expect(screen.getByText('74%')).toBeInTheDocument()
  })

  it('mostra skeleton enquanto carrega', () => {
    const { container } = render(<ResumoPanel data={undefined} isLoading />)
    expect(container.querySelector('.animate-pulse')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npm --prefix web run test -- src/features/dashboard/panels/ResumoPanel.test.tsx`
Expected: FAIL ("Failed to resolve import './ResumoPanel'").

- [ ] **Step 3: Implementar o ProgressRing**

Create `web/src/features/dashboard/ProgressRing.tsx`:

```tsx
/** Anel de progresso SVG puro (usa tokens da marca via CSS vars). */
export function ProgressRing({ pct, size = 96 }: { pct: number; size?: number }) {
  const stroke = 10
  const c = size / 2
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const clamped = Math.min(Math.max(pct, 0), 100)
  const filled = circ * (clamped / 100)
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ transform: 'rotate(-90deg)' }}
      aria-hidden="true"
    >
      <circle cx={c} cy={c} r={r} fill="none" stroke="var(--muted)" strokeWidth={stroke} />
      <circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke="var(--primary)"
        strokeWidth={stroke}
        strokeDasharray={`${filled} ${circ - filled}`}
        strokeLinecap="round"
      />
    </svg>
  )
}
```

- [ ] **Step 4: Implementar o ResumoPanel**

Create `web/src/features/dashboard/panels/ResumoPanel.tsx`:

```tsx
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatBRL } from '@/lib/format'
import { ShieldCheck, Clock } from 'lucide-react'
import { ProgressRing } from '../ProgressRing'
import type { DashboardData } from '../useDashboard'

interface ResumoPanelProps {
  data: DashboardData | undefined
  isLoading: boolean
}

export function ResumoPanel({ data, isLoading }: ResumoPanelProps) {
  if (isLoading) {
    return (
      <Card className="h-full rounded-2xl p-6 shadow-sm">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-4 h-10 w-48" />
        <div className="mt-6 flex gap-4">
          <Skeleton className="h-16 flex-1" />
          <Skeleton className="h-16 flex-1" />
        </div>
      </Card>
    )
  }
  if (!data) return null

  const pct = Math.round(data.percentualPago * 100)

  return (
    <Card className="flex h-full flex-col justify-center rounded-2xl p-6 shadow-sm">
      <p className="text-sm font-medium text-muted-foreground">Total do mês</p>
      <p className="mt-1 text-4xl font-bold tracking-tight text-foreground tabular-nums">
        {formatBRL(data.totalDoMes)}
      </p>

      <div className="mt-6 flex items-center gap-6">
        <div className="relative flex-shrink-0">
          <ProgressRing pct={pct} />
          <span className="absolute inset-0 flex items-center justify-center text-base font-bold text-foreground">
            {pct}%
          </span>
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 shrink-0 text-primary-strong" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Já pago</p>
              <p className="truncate text-lg font-semibold text-foreground tabular-nums">
                {formatBRL(data.jaPago)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 shrink-0 text-secondary" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Falta pagar</p>
              <p className="truncate text-lg font-semibold text-foreground tabular-nums">
                {formatBRL(data.faltaPagar)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}
```

- [ ] **Step 5: Rodar o teste e ver passar**

Run: `npm --prefix web run test -- src/features/dashboard/panels/ResumoPanel.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add web/src/features/dashboard/ProgressRing.tsx web/src/features/dashboard/panels/ResumoPanel.tsx web/src/features/dashboard/panels/ResumoPanel.test.tsx
git commit -F- <<'EOF'
feat(web): painel Resumo do dashboard (hero) + ProgressRing extraido

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SbvRxKvyw5dGYdfq1Fv22q
EOF
```

---

## Task 3: BalancoPanel (Painel 2)

**Files:**
- Create: `web/src/features/dashboard/panels/BalancoPanel.tsx`
- Test: `web/src/features/dashboard/panels/BalancoPanel.test.tsx`

**Interfaces:**
- Consumes: `DashboardData` (`receitas`, `saldo`, `assinaturasCartao`); `formatBRL`; `cn`; `Card`; `Skeleton`.
- Produces: `BalancoPanel({ data: DashboardData | undefined, isLoading: boolean }): JSX.Element | null`

- [ ] **Step 1: Escrever o teste do BalancoPanel (falha)**

Create `web/src/features/dashboard/panels/BalancoPanel.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { BalancoPanel } from './BalancoPanel'
import type { DashboardData } from '../useDashboard'

const base: DashboardData = {
  totalDoMes: 4200,
  jaPago: 3100,
  faltaPagar: 1100,
  percentualPago: 0.74,
  receitas: 5300,
  saldo: 1100,
  assinaturasCartao: 320,
  breakdownPorCategoria: [],
}

describe('BalancoPanel', () => {
  it('mostra receitas, saldo e assinaturas', () => {
    render(<BalancoPanel data={base} isLoading={false} />)
    expect(screen.getByText('R$ 5.300,00')).toBeInTheDocument()
    expect(screen.getByText('R$ 1.100,00')).toBeInTheDocument()
    expect(screen.getByText('R$ 320,00')).toBeInTheDocument()
  })

  it('saldo negativo aparece em vermelho (destructive)', () => {
    render(<BalancoPanel data={{ ...base, saldo: -200 }} isLoading={false} />)
    const saldo = screen.getByText('-R$ 200,00')
    expect(saldo.className).toContain('text-destructive')
  })
})
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npm --prefix web run test -- src/features/dashboard/panels/BalancoPanel.test.tsx`
Expected: FAIL ("Failed to resolve import './BalancoPanel'").

- [ ] **Step 3: Implementar o BalancoPanel**

Create `web/src/features/dashboard/panels/BalancoPanel.tsx`:

```tsx
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatBRL } from '@/lib/format'
import { cn } from '@/lib/utils'
import { TrendingUp, Wallet, CreditCard } from 'lucide-react'
import type { DashboardData } from '../useDashboard'

interface BalancoPanelProps {
  data: DashboardData | undefined
  isLoading: boolean
}

export function BalancoPanel({ data, isLoading }: BalancoPanelProps) {
  if (isLoading) {
    return (
      <Card className="h-full rounded-2xl p-6 shadow-sm">
        <Skeleton className="h-4 w-24" />
        <div className="mt-6 space-y-5">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </Card>
    )
  }
  if (!data) return null

  const saldoPositive = data.saldo >= 0

  return (
    <Card className="flex h-full flex-col justify-center rounded-2xl p-6 shadow-sm">
      <p className="text-sm font-medium text-muted-foreground">Balanço do mês</p>

      <div className="mt-5 space-y-5">
        {/* Receitas */}
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <TrendingUp className="h-4 w-4 text-primary-strong" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">Receitas</p>
            <p className="truncate text-lg font-semibold text-foreground tabular-nums">
              {formatBRL(data.receitas)}
            </p>
          </div>
        </div>

        {/* Saldo */}
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
              saldoPositive ? 'bg-primary/10' : 'bg-destructive/10',
            )}
          >
            <Wallet
              className={cn('h-4 w-4', saldoPositive ? 'text-primary-strong' : 'text-destructive')}
            />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">Saldo</p>
            <p
              className={cn(
                'truncate text-lg font-semibold tabular-nums',
                saldoPositive ? 'text-primary-strong' : 'text-destructive',
              )}
            >
              {formatBRL(data.saldo)}
            </p>
          </div>
        </div>

        {/* Assinaturas de cartão */}
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">Assinaturas de cartão</p>
            <p className="truncate text-lg font-semibold text-foreground tabular-nums">
              {formatBRL(data.assinaturasCartao)}
            </p>
            <p className="text-[11px] text-muted-foreground">Não incluso no total do mês</p>
          </div>
        </div>
      </div>
    </Card>
  )
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npm --prefix web run test -- src/features/dashboard/panels/BalancoPanel.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/features/dashboard/panels/BalancoPanel.tsx web/src/features/dashboard/panels/BalancoPanel.test.tsx
git commit -F- <<'EOF'
feat(web): painel Balanco do dashboard (receitas, saldo, assinaturas)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SbvRxKvyw5dGYdfq1Fv22q
EOF
```

---

## Task 4: Montar o DashboardPage (carrossel/grade) + charts h-full + remover SummaryCards

**Files:**
- Modify: `web/src/features/dashboard/YearlyEvolutionChart.tsx` (Card raiz → `h-full`)
- Modify: `web/src/features/dashboard/CategoryBreakdownChart.tsx` (Card raiz → `h-full`)
- Modify (reescrever): `web/src/features/dashboard/DashboardPage.tsx`
- Delete: `web/src/features/dashboard/SummaryCards.tsx`
- Test: `web/src/features/dashboard/DashboardPage.test.tsx`

**Interfaces:**
- Consumes: `Carousel`, `CarouselItem` (Task 1); `ResumoPanel` (Task 2); `BalancoPanel` (Task 3); `YearlyEvolutionChart`, `CategoryBreakdownChart`, `MonthYearPicker`, `useDashboard`, `useYearly` (existentes).

> **Nota de layout:** os `CarouselItem` são `basis-full` num container `flex`; o `align-items: stretch` padrão faz todos os painéis terem a altura do mais alto (os gráficos ≈ 380px). Como os painéis de métrica usam `h-full` + `justify-center`, eles esticam e centralizam — alturas uniformes sem `min-height` fixo. No `lg` a faixa vira `grid grid-cols-2` (2×2).

- [ ] **Step 1: Ajustar YearlyEvolutionChart para preencher a altura**

Em `web/src/features/dashboard/YearlyEvolutionChart.tsx`, trocar (as duas ocorrências — skeleton e principal):

`<Card className="rounded-2xl shadow-sm">` → `<Card className="h-full rounded-2xl shadow-sm">`

(Edit com `replace_all: true`.)

- [ ] **Step 2: Ajustar CategoryBreakdownChart para preencher a altura**

Em `web/src/features/dashboard/CategoryBreakdownChart.tsx`, trocar (as duas ocorrências):

`<Card className="rounded-2xl shadow-sm">` → `<Card className="h-full rounded-2xl shadow-sm">`

(Edit com `replace_all: true`.)

- [ ] **Step 3: Escrever o teste do DashboardPage (falha)**

Create `web/src/features/dashboard/DashboardPage.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

// Mocka os hooks de dados para evitar rede/React Query no teste.
vi.mock('./useDashboard', () => ({
  useDashboard: () => ({
    data: {
      totalDoMes: 4200,
      jaPago: 3100,
      faltaPagar: 1100,
      percentualPago: 0.74,
      receitas: 5300,
      saldo: 1100,
      assinaturasCartao: 320,
      breakdownPorCategoria: [],
    },
    isLoading: false,
    isError: false,
  }),
  useYearly: () => ({ data: { months: [] }, isLoading: false }),
}))

import DashboardPage from './DashboardPage'

describe('DashboardPage', () => {
  it('renderiza os 4 painéis do carrossel com os dados', () => {
    render(<DashboardPage />)
    expect(screen.getByText('R$ 4.200,00')).toBeInTheDocument() // Resumo
    expect(screen.getByText('R$ 5.300,00')).toBeInTheDocument() // Balanço (receitas)
    expect(screen.getAllByRole('tab')).toHaveLength(4) // 4 dots
  })
})
```

- [ ] **Step 4: Rodar o teste e ver falhar**

Run: `npm --prefix web run test -- src/features/dashboard/DashboardPage.test.tsx`
Expected: FAIL (ainda mostra `SummaryCards`, sem dots/`role="tab"`).

- [ ] **Step 5: Reescrever o DashboardPage**

Replace o conteúdo de `web/src/features/dashboard/DashboardPage.tsx` por:

```tsx
import { useState } from 'react'
import { useDashboard, useYearly } from './useDashboard'
import { MonthYearPicker } from './MonthYearPicker'
import { ResumoPanel } from './panels/ResumoPanel'
import { BalancoPanel } from './panels/BalancoPanel'
import { YearlyEvolutionChart } from './YearlyEvolutionChart'
import { CategoryBreakdownChart } from './CategoryBreakdownChart'
import { Carousel, CarouselItem } from '@/components/ui/carousel'

export default function DashboardPage() {
  // Ano atual e mês 1-based; inicializadores lazy (new Date() só uma vez).
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [month, setMonth] = useState(() => new Date().getMonth() + 1)

  const { data: dashData, isLoading: dashLoading, isError: dashError } = useDashboard(year, month)
  const { data: yearlyData, isLoading: yearlyLoading } = useYearly(year)

  return (
    <div className="space-y-6">
      {/* Cabeçalho + seletor */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Visão geral das finanças do período selecionado
          </p>
        </div>
        <MonthYearPicker
          year={year}
          month={month}
          onYearChange={setYear}
          onMonthChange={setMonth}
        />
      </div>

      {dashError && !dashLoading && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Erro ao carregar os dados do período. Tente novamente.
        </div>
      )}

      {/* Carrossel de painéis (mobile) → grade 2×2 (lg) */}
      <Carousel gridClassName="lg:grid-cols-2">
        <CarouselItem>
          <ResumoPanel data={dashData} isLoading={dashLoading} />
        </CarouselItem>
        <CarouselItem>
          <BalancoPanel data={dashData} isLoading={dashLoading} />
        </CarouselItem>
        <CarouselItem>
          <YearlyEvolutionChart data={yearlyData?.months} isLoading={yearlyLoading} />
        </CarouselItem>
        <CarouselItem>
          <CategoryBreakdownChart data={dashData?.breakdownPorCategoria} isLoading={dashLoading} />
        </CarouselItem>
      </Carousel>
    </div>
  )
}
```

- [ ] **Step 6: Remover o SummaryCards (não é mais usado)**

```bash
git rm web/src/features/dashboard/SummaryCards.tsx
```

- [ ] **Step 7: Rodar o teste do DashboardPage e ver passar**

Run: `npm --prefix web run test -- src/features/dashboard/DashboardPage.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 8: Rodar toda a suíte de testes (garantir que nada quebrou)**

Run: `npm --prefix web run test`
Expected: PASS (todos, incluindo os existentes `format`, `math`).

- [ ] **Step 9: Commit**

```bash
git add web/src/features/dashboard/DashboardPage.tsx web/src/features/dashboard/DashboardPage.test.tsx web/src/features/dashboard/YearlyEvolutionChart.tsx web/src/features/dashboard/CategoryBreakdownChart.tsx
git commit -F- <<'EOF'
feat(web): dashboard em carrossel de 4 paineis (grade no desktop)

Substitui os cards empilhados por Resumo/Balanco/Evolucao/Categoria num
carrossel deslizavel no mobile e grade 2x2 no desktop. Remove SummaryCards.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SbvRxKvyw5dGYdfq1Fv22q
EOF
```

---

## Task 5: Núcleo do puxar-pra-atualizar (reducer + helpers puros)

**Files:**
- Create: `web/src/hooks/pullToRefreshCore.ts`
- Test: `web/src/hooks/pullToRefreshCore.test.ts`

**Interfaces:**
- Produces:
  - Constantes: `PULL_THRESHOLD = 70`, `PULL_MAX_OFFSET = 120`, `PULL_RESISTANCE = 0.5`, `PULL_RESTING = 56`, `MIN_REFRESH_MS = 500`
  - `type PullStatus = 'idle' | 'pulling' | 'refreshing'`
  - `interface PullState { status: PullStatus; offset: number; armed: boolean }`
  - `initialPullState: PullState`
  - `type PullAction = { type: 'start'; atTop: boolean } | { type: 'move'; dy: number } | { type: 'end' } | { type: 'settle' }`
  - `computePullOffset(dy: number): number`
  - `shouldTriggerRefresh(offset: number): boolean`
  - `pullReducer(state: PullState, action: PullAction): PullState`

- [ ] **Step 1: Escrever os testes do núcleo (falha)**

Create `web/src/hooks/pullToRefreshCore.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  computePullOffset,
  shouldTriggerRefresh,
  pullReducer,
  initialPullState,
  PULL_RESTING,
} from './pullToRefreshCore'

describe('computePullOffset', () => {
  it('aplica resistência (0.5)', () => {
    expect(computePullOffset(200)).toBe(100)
  })
  it('limita no máximo', () => {
    expect(computePullOffset(1000)).toBe(120)
  })
  it('ignora puxão pra cima ou zero', () => {
    expect(computePullOffset(0)).toBe(0)
    expect(computePullOffset(-50)).toBe(0)
  })
})

describe('shouldTriggerRefresh', () => {
  it('dispara no limite (70) ou acima', () => {
    expect(shouldTriggerRefresh(70)).toBe(true)
    expect(shouldTriggerRefresh(71)).toBe(true)
  })
  it('não dispara abaixo do limite', () => {
    expect(shouldTriggerRefresh(69)).toBe(false)
  })
})

describe('pullReducer', () => {
  it("'start' no topo arma o gesto", () => {
    const s = pullReducer(initialPullState, { type: 'start', atTop: true })
    expect(s.armed).toBe(true)
  })
  it("'start' fora do topo não arma", () => {
    const s = pullReducer(initialPullState, { type: 'start', atTop: false })
    expect(s.armed).toBe(false)
  })
  it("'move' armado entra em pulling com offset", () => {
    const armed = { status: 'idle' as const, offset: 0, armed: true }
    const s = pullReducer(armed, { type: 'move', dy: 200 })
    expect(s.status).toBe('pulling')
    expect(s.offset).toBe(100)
  })
  it("'move' sem armar é ignorado", () => {
    const s = pullReducer(initialPullState, { type: 'move', dy: 200 })
    expect(s.status).toBe('idle')
    expect(s.offset).toBe(0)
  })
  it("'end' acima do limite vai pra refreshing", () => {
    const pulling = { status: 'pulling' as const, offset: 100, armed: true }
    const s = pullReducer(pulling, { type: 'end' })
    expect(s.status).toBe('refreshing')
    expect(s.offset).toBe(PULL_RESTING)
  })
  it("'end' abaixo do limite volta pra idle", () => {
    const pulling = { status: 'pulling' as const, offset: 40, armed: true }
    const s = pullReducer(pulling, { type: 'end' })
    expect(s.status).toBe('idle')
    expect(s.offset).toBe(0)
  })
  it("'settle' zera o estado", () => {
    const refreshing = { status: 'refreshing' as const, offset: PULL_RESTING, armed: false }
    const s = pullReducer(refreshing, { type: 'settle' })
    expect(s).toEqual(initialPullState)
  })
})
```

- [ ] **Step 2: Rodar os testes e ver falhar**

Run: `npm --prefix web run test -- src/hooks/pullToRefreshCore.test.ts`
Expected: FAIL ("Failed to resolve import './pullToRefreshCore'").

- [ ] **Step 3: Implementar o núcleo**

Create `web/src/hooks/pullToRefreshCore.ts`:

```ts
export const PULL_THRESHOLD = 70
export const PULL_MAX_OFFSET = 120
export const PULL_RESISTANCE = 0.5
export const PULL_RESTING = 56
export const MIN_REFRESH_MS = 500

export type PullStatus = 'idle' | 'pulling' | 'refreshing'

export interface PullState {
  status: PullStatus
  offset: number
  armed: boolean
}

export const initialPullState: PullState = { status: 'idle', offset: 0, armed: false }

export type PullAction =
  | { type: 'start'; atTop: boolean }
  | { type: 'move'; dy: number }
  | { type: 'end' }
  | { type: 'settle' }

/** Deslocamento com resistência, limitado ao teto. Puxão pra cima → 0. */
export function computePullOffset(dy: number): number {
  if (dy <= 0) return 0
  return Math.min(dy * PULL_RESISTANCE, PULL_MAX_OFFSET)
}

export function shouldTriggerRefresh(offset: number): boolean {
  return offset >= PULL_THRESHOLD
}

export function pullReducer(state: PullState, action: PullAction): PullState {
  switch (action.type) {
    case 'start':
      // Só arma quando o scroller está no topo.
      return { status: 'idle', offset: 0, armed: action.atTop }
    case 'move': {
      if (!state.armed) return state
      const offset = computePullOffset(action.dy)
      if (offset <= 0) return { ...state, status: 'idle', offset: 0 }
      return { ...state, status: 'pulling', offset }
    }
    case 'end':
      if (state.status !== 'pulling') return { ...initialPullState }
      return shouldTriggerRefresh(state.offset)
        ? { status: 'refreshing', offset: PULL_RESTING, armed: false }
        : { ...initialPullState }
    case 'settle':
      return { ...initialPullState }
    default:
      return state
  }
}
```

- [ ] **Step 4: Rodar os testes e ver passar**

Run: `npm --prefix web run test -- src/hooks/pullToRefreshCore.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add web/src/hooks/pullToRefreshCore.ts web/src/hooks/pullToRefreshCore.test.ts
git commit -F- <<'EOF'
feat(web): nucleo do puxar-pra-atualizar (reducer + helpers puros)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SbvRxKvyw5dGYdfq1Fv22q
EOF
```

---

## Task 6: Hook usePullToRefresh

**Files:**
- Create: `web/src/hooks/usePullToRefresh.ts`
- Test: `web/src/hooks/usePullToRefresh.test.tsx`

**Interfaces:**
- Consumes: `pullReducer`, `initialPullState`, `PULL_THRESHOLD`, `MIN_REFRESH_MS`, `PullStatus` de `./pullToRefreshCore`.
- Produces:
  - `interface UsePullToRefreshResult { offset: number; status: PullStatus; progress: number }`
  - `usePullToRefresh(scrollerRef: RefObject<HTMLElement | null>, onRefresh: () => Promise<unknown>): UsePullToRefreshResult`

- [ ] **Step 1: Escrever o teste do hook (falha)**

Create `web/src/hooks/usePullToRefresh.test.tsx`:

```tsx
import { render, fireEvent, screen } from '@testing-library/react'
import { useRef } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { usePullToRefresh } from './usePullToRefresh'

function Harness({ onRefresh }: { onRefresh: () => Promise<unknown> }) {
  const ref = useRef<HTMLDivElement>(null)
  const { status } = usePullToRefresh(ref, onRefresh)
  return (
    <div>
      <div data-testid="scroller" ref={ref} style={{ height: 100, overflow: 'auto' }}>
        conteúdo
      </div>
      <span data-testid="status">{status}</span>
    </div>
  )
}

function setScrollTop(el: HTMLElement, value: number) {
  Object.defineProperty(el, 'scrollTop', { configurable: true, get: () => value })
}

beforeEach(() => {
  // jsdom não implementa matchMedia; simulamos um dispositivo de toque.
  window.matchMedia = vi.fn().mockReturnValue({
    matches: true,
    media: '(pointer: coarse)',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as unknown as typeof window.matchMedia
})

describe('usePullToRefresh', () => {
  it('chama onRefresh ao puxar além do limite a partir do topo', () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    render(<Harness onRefresh={onRefresh} />)
    const scroller = screen.getByTestId('scroller')
    setScrollTop(scroller, 0)

    fireEvent.touchStart(scroller, { touches: [{ clientX: 0, clientY: 0 }] })
    fireEvent.touchMove(scroller, { touches: [{ clientX: 0, clientY: 200 }] })
    fireEvent.touchEnd(scroller, { changedTouches: [{ clientX: 0, clientY: 200 }] })

    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('status').textContent).toBe('refreshing')
  })

  it('não dispara quando o scroll não está no topo', () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    render(<Harness onRefresh={onRefresh} />)
    const scroller = screen.getByTestId('scroller')
    setScrollTop(scroller, 120)

    fireEvent.touchStart(scroller, { touches: [{ clientX: 0, clientY: 0 }] })
    fireEvent.touchMove(scroller, { touches: [{ clientX: 0, clientY: 200 }] })
    fireEvent.touchEnd(scroller, { changedTouches: [{ clientX: 0, clientY: 200 }] })

    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('não dispara em dispositivo sem toque', () => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      media: '(pointer: coarse)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }) as unknown as typeof window.matchMedia
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    render(<Harness onRefresh={onRefresh} />)
    const scroller = screen.getByTestId('scroller')
    setScrollTop(scroller, 0)

    fireEvent.touchStart(scroller, { touches: [{ clientX: 0, clientY: 0 }] })
    fireEvent.touchMove(scroller, { touches: [{ clientX: 0, clientY: 200 }] })
    fireEvent.touchEnd(scroller, { changedTouches: [{ clientX: 0, clientY: 200 }] })

    expect(onRefresh).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npm --prefix web run test -- src/hooks/usePullToRefresh.test.tsx`
Expected: FAIL ("Failed to resolve import './usePullToRefresh'").

- [ ] **Step 3: Implementar o hook**

Create `web/src/hooks/usePullToRefresh.ts`:

```ts
import { useEffect, useReducer, useRef, type RefObject } from 'react'
import {
  pullReducer,
  initialPullState,
  PULL_THRESHOLD,
  MIN_REFRESH_MS,
  type PullStatus,
} from './pullToRefreshCore'

function isTouchDevice(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches
  )
}

export interface UsePullToRefreshResult {
  offset: number
  status: PullStatus
  /** 0..1 rumo ao limite de disparo (para animar seta/opacidade). */
  progress: number
}

/**
 * Liga os eventos de toque de um scroller ao reducer do gesto e dispara
 * `onRefresh` quando o puxão passa do limite. Só ativa em dispositivos de toque.
 */
export function usePullToRefresh(
  scrollerRef: RefObject<HTMLElement | null>,
  onRefresh: () => Promise<unknown>,
): UsePullToRefreshResult {
  const [state, dispatch] = useReducer(pullReducer, initialPullState)

  // Refs para ler estado/onRefresh atuais dentro de listeners fixos.
  const stateRef = useRef(state)
  stateRef.current = state
  const startRef = useRef({ x: 0, y: 0 })
  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh

  useEffect(() => {
    const el = scrollerRef.current
    if (!el || !isTouchDevice()) return

    function handleStart(e: TouchEvent) {
      if (stateRef.current.status === 'refreshing') return
      const t = e.touches[0]
      startRef.current = { x: t.clientX, y: t.clientY }
      dispatch({ type: 'start', atTop: (el as HTMLElement).scrollTop <= 0 })
    }

    function handleMove(e: TouchEvent) {
      const s = stateRef.current
      if (!s.armed || s.status === 'refreshing') return
      const t = e.touches[0]
      const dy = t.clientY - startRef.current.y
      const dx = t.clientX - startRef.current.x
      // Só engata num puxão pra baixo predominantemente vertical
      // (evita conflito com o swipe horizontal do carrossel).
      if (dy <= 0 || Math.abs(dy) <= Math.abs(dx)) return
      e.preventDefault() // bloqueia o pull-to-refresh nativo do Chrome Android
      dispatch({ type: 'move', dy })
    }

    function handleEnd() {
      if (stateRef.current.status === 'pulling') dispatch({ type: 'end' })
      else dispatch({ type: 'settle' })
    }

    // touchmove precisa ser NÃO-passivo para permitir preventDefault
    // (o React registra touch como passivo por padrão).
    el.addEventListener('touchstart', handleStart, { passive: true })
    el.addEventListener('touchmove', handleMove, { passive: false })
    el.addEventListener('touchend', handleEnd, { passive: true })
    el.addEventListener('touchcancel', handleEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', handleStart)
      el.removeEventListener('touchmove', handleMove)
      el.removeEventListener('touchend', handleEnd)
      el.removeEventListener('touchcancel', handleEnd)
    }
  }, [scrollerRef])

  // Dispara o refresh ao entrar em 'refreshing'; mantém o indicador por um
  // tempo mínimo para não "piscar".
  useEffect(() => {
    if (state.status !== 'refreshing') return
    let cancelled = false
    const started = performance.now()
    void Promise.resolve(onRefreshRef.current())
      .catch(() => {})
      .then(() => {
        const wait = Math.max(0, MIN_REFRESH_MS - (performance.now() - started))
        window.setTimeout(() => {
          if (!cancelled) dispatch({ type: 'settle' })
        }, wait)
      })
    return () => {
      cancelled = true
    }
  }, [state.status])

  const progress = Math.min(1, state.offset / PULL_THRESHOLD)
  return { offset: state.offset, status: state.status, progress }
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npm --prefix web run test -- src/hooks/usePullToRefresh.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/hooks/usePullToRefresh.ts web/src/hooks/usePullToRefresh.test.tsx
git commit -F- <<'EOF'
feat(web): hook usePullToRefresh (gesto de toque -> reducer -> refresh)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SbvRxKvyw5dGYdfq1Fv22q
EOF
```

---

## Task 7: Componente PullToRefresh (wrapper + indicador)

**Files:**
- Create: `web/src/components/PullToRefresh.tsx`
- Test: `web/src/components/PullToRefresh.test.tsx`

**Interfaces:**
- Consumes: `usePullToRefresh` (Task 6); `cn`; `RefreshCw` (lucide-react).
- Produces: `PullToRefresh({ onRefresh: () => Promise<unknown>, className?: string, children: ReactNode }): JSX.Element` — renderiza um `<main>` scroller.

- [ ] **Step 1: Escrever o teste do componente (falha)**

Create `web/src/components/PullToRefresh.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { PullToRefresh } from './PullToRefresh'

describe('PullToRefresh', () => {
  it('renderiza os filhos dentro do main', () => {
    render(
      <PullToRefresh onRefresh={() => Promise.resolve()}>
        <p>conteúdo da página</p>
      </PullToRefresh>,
    )
    expect(screen.getByText('conteúdo da página')).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npm --prefix web run test -- src/components/PullToRefresh.test.tsx`
Expected: FAIL ("Failed to resolve import './PullToRefresh'").

- [ ] **Step 3: Implementar o componente**

Create `web/src/components/PullToRefresh.tsx`:

```tsx
import { useRef, type ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'

interface PullToRefreshProps {
  onRefresh: () => Promise<unknown>
  className?: string
  children: ReactNode
}

/**
 * Container de scroll principal (`<main>`) com puxar-pra-atualizar por toque.
 * No desktop (sem toque) se comporta como um `<main>` de scroll comum.
 */
export function PullToRefresh({ onRefresh, className, children }: PullToRefreshProps) {
  const scrollerRef = useRef<HTMLElement>(null)
  const { offset, status, progress } = usePullToRefresh(scrollerRef, onRefresh)
  const active = status !== 'idle' || offset > 0

  return (
    <main ref={scrollerRef} className={cn('relative overscroll-y-contain', className)}>
      {/* Indicador de refresh (sobreposto no topo) */}
      <div
        aria-hidden={!active}
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center"
        style={{
          transform: `translateY(${Math.max(offset - 44, -44)}px)`,
          opacity: active ? (status === 'refreshing' ? 1 : Math.min(1, progress + 0.2)) : 0,
          transition: status === 'idle' ? 'transform .2s ease, opacity .2s ease' : 'none',
        }}
      >
        <div className="mt-3 rounded-full border border-border bg-card p-2 shadow-md">
          <RefreshCw
            className={cn(
              'h-5 w-5 text-primary',
              status === 'refreshing' && 'animate-spin motion-reduce:animate-none',
            )}
            style={
              status === 'refreshing' ? undefined : { transform: `rotate(${progress * 270}deg)` }
            }
          />
        </div>
      </div>

      {/* Conteúdo acompanha o puxão */}
      <div
        style={{
          transform: offset > 0 ? `translateY(${offset}px)` : undefined,
          transition: status === 'idle' ? 'transform .2s ease' : 'none',
        }}
      >
        {children}
      </div>
    </main>
  )
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npm --prefix web run test -- src/components/PullToRefresh.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add web/src/components/PullToRefresh.tsx web/src/components/PullToRefresh.test.tsx
git commit -F- <<'EOF'
feat(web): componente PullToRefresh (main scroller + indicador)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SbvRxKvyw5dGYdfq1Fv22q
EOF
```

---

## Task 8: Integrar o PullToRefresh no AppLayout

**Files:**
- Modify: `web/src/app/AppLayout.tsx`

**Interfaces:**
- Consumes: `PullToRefresh` (Task 7); `queryClient` de `@/lib/query`.

- [ ] **Step 1: Adicionar os imports no AppLayout**

Em `web/src/app/AppLayout.tsx`, logo após `import { useSession } from '@/features/auth/session'`, adicionar:

```tsx
import { PullToRefresh } from '@/components/PullToRefresh'
import { queryClient } from '@/lib/query'
```

- [ ] **Step 2: Trocar o `<main>` pelo PullToRefresh**

Em `web/src/app/AppLayout.tsx`, substituir o bloco:

```tsx
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
```

por:

```tsx
        <PullToRefresh
          onRefresh={() => queryClient.refetchQueries({ type: 'active' })}
          className="flex-1 overflow-y-auto p-4 lg:p-6"
        >
          <Outlet />
        </PullToRefresh>
```

- [ ] **Step 3: Verificar tipos e build**

Run: `npm --prefix web run build`
Expected: build OK (sem erros de TypeScript). O `tsc -b` valida os tipos de todos os arquivos novos.

- [ ] **Step 4: Rodar toda a suíte de testes**

Run: `npm --prefix web run test`
Expected: PASS (todos os testes: existentes + novos).

- [ ] **Step 5: Lint**

Run: `npm --prefix web run lint`
Expected: sem erros (avisos, se houver, não bloqueiam).

- [ ] **Step 6: Commit**

```bash
git add web/src/app/AppLayout.tsx
git commit -F- <<'EOF'
feat(web): puxar-pra-atualizar global via refetch das queries ativas

Envolve o <main> do AppLayout com PullToRefresh; toda pagina se atualiza
sozinha ao puxar pra baixo no toque, sem fiacao por pagina.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SbvRxKvyw5dGYdfq1Fv22q
EOF
```

---

## Verificação final

Depois de todas as tasks, a partir da raiz do repo:

- [ ] `npm --prefix web run test` → todos os testes passam.
- [ ] `npm --prefix web run build` → build de produção sem erros de tipo.
- [ ] `npm --prefix web run lint` → sem erros.
- [ ] **Teste manual (mobile / DevTools em modo dispositivo):**
  - Dashboard: deslizar entre os 4 painéis; dots acompanham e são clicáveis; no desktop aparece a grade 2×2.
  - Em qualquer página, no topo da lista, puxar pra baixo → indicador aparece, gira e os dados recarregam; soltar antes do limite não recarrega.
  - No desktop com mouse, o gesto não interfere na navegação.

---

## Self-Review (feita pelo autor do plano)

**1. Cobertura do spec:**
- §3 Dashboard carrossel → Tasks 1–4 (primitivo, painéis, montagem, grade no desktop). ✓
- §3.4 remover SummaryCards / reaproveitar ProgressRing → Task 2 (ProgressRing) + Task 4 (remoção). ✓
- §3.5 gráficos `h-full` → Task 4 steps 1–2. ✓
- §4 Pull-to-refresh (ponto único, toque, queries ativas, overscroll/preventDefault, indicador) → Tasks 5–8. ✓
- §7 Testes (helpers/reducer, dots, painéis) → testes em cada task. ✓
- §8 Fora de escopo respeitado (sem dark mode, sem redesenho de dados de gráfico, sem botão desktop, sem backend). ✓

**2. Placeholders:** nenhum TBD/TODO; todo passo tem código/comando concreto. ✓

**3. Consistência de tipos:** `DashboardData` usado nos painéis casa com `useDashboard.ts`; `PullState`/`PullAction`/`pullReducer`/`computePullOffset`/`shouldTriggerRefresh` idênticos entre Task 5 (def) e Task 6 (uso); `activeIndexFromScroll` idêntico entre Task 1 utils e uso no `carousel.tsx`; `usePullToRefresh(scrollerRef, onRefresh)` idêntico entre Task 6 (def) e Task 7 (uso); `Carousel`/`CarouselItem` idênticos entre Task 1 e Task 4. ✓
