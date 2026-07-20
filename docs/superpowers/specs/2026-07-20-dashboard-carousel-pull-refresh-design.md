# Dashboard em carrossel + Puxar-pra-atualizar — Design

**Data:** 2026-07-20
**Status:** Aprovado (aguardando plano de implementação)
**Escopo:** Web (`web/`) — sem mudanças na API.

---

## 1. Objetivo

Duas melhorias de UX, ambas mobile-first (o app é um PWA):

1. **Dashboard em carrossel de painéis "hero"** — trocar o empilhado de 7 cards + 2 gráficos por
   painéis grandes e deslizáveis no celular, e uma grade completa no desktop.
2. **Puxar-pra-atualizar** — gesto global que recarrega os dados da tela atual em **todas** as
   páginas, com indicador visual.

**Princípios:** sem novas dependências, sem mudanças de backend, sem dark mode (ver §8 — Fora de escopo).

---

## 2. Contexto atual

- Stack: React 19 + Vite + TypeScript + Tailwind 4 + shadcn/ui + `@tanstack/react-query` + Recharts.
- `DashboardPage.tsx` renderiza: header + `MonthYearPicker`, `SummaryCards` (4 cards primários +
  3 secundários) e 2 gráficos lado a lado (`YearlyEvolutionChart`, `CategoryBreakdownChart`).
- Layout (`app/AppLayout.tsx`): sidebar (desktop) / gaveta (mobile), topbar, e o container de scroll
  é `<main className="flex-1 overflow-y-auto p-4 lg:p-6">` com `<Outlet />`.
- Todas as páginas buscam dados via React Query (`useDashboard`, `useEntries`, `useCategories`, …).
- `queryClient` é um singleton exportado de `@/lib/query` e provido na raiz (`main.tsx`).
- Paleta da marca (light apenas): verde `--primary #4CAF82` / `--primary-strong #2E8B63`,
  amarelo `#F5C84C`, vermelho `--danger #E5534B`, texto `#1F2937`.

---

## 3. Feature A — Dashboard em carrossel

### 3.1 Decisões (validadas com o usuário)

- **Formato:** painéis "hero" deslizáveis (cada slide é um painel grande e autossuficiente).
- **Organização:** 4 painéis.
- **Responsivo:** carrossel no celular; grade completa no desktop (`lg`).

### 3.2 Os 4 painéis

| # | Painel | Conteúdo | Fonte de dados |
|---|--------|----------|----------------|
| 1 | **Resumo do mês** | Total do mês (destaque grande) · Já pago · Falta pagar · anel de % pago | `useDashboard` |
| 2 | **Balanço** | Receitas · Saldo (verde se ≥ 0, vermelho se < 0) · Assinaturas de cartão ("não incluso no total") | `useDashboard` |
| 3 | **Evolução Anual** | gráfico de linha (Total × Pago, 12 meses) | `useYearly` |
| 4 | **Gastos por Categoria** | gráfico de pizza (donut) | `useDashboard` |

O conteúdo dos painéis é **idêntico** entre mobile e desktop — só o layout externo muda
(carrossel vs. grade). Isso mantém uma única fonte de verdade por painel.

### 3.3 Componente de carrossel (`components/ui/carousel.tsx`)

Primitivo reutilizável, sem biblioteca, baseado em `scroll-snap` nativo (excelente no iOS/Android,
momentum grátis, zero bytes de dependência).

- **`Carousel`**: renderiza a "viewport" (faixa com scroll horizontal) + os dots embaixo.
  - Mobile: `flex gap-4 overflow-x-auto snap-x snap-mandatory overscroll-x-contain`.
  - Desktop: as classes de grade vêm por `className` (ex.: `lg:grid lg:grid-cols-2 lg:gap-6
    lg:overflow-visible`), e os dots ficam `lg:hidden`.
  - Rastreia o índice ativo pela posição de scroll (`round(scrollLeft / itemWidth)`), com throttle
    via `requestAnimationFrame`.
- **`CarouselItem`**: wrapper de cada painel — `snap-center shrink-0 w-full lg:w-auto`.
- **`CarouselDots`**: bolinhas clicáveis; a ativa em verde (`--primary`), as demais em `--muted`.
  Clicar chama `scrollTo({ left, behavior: 'smooth' })`. Acessível: `role="tablist"`, cada dot é um
  `button` com `aria-label` ("Ir para o painel N") e `aria-selected`.

**Altura uniforme (mobile):** como os painéis têm alturas naturais diferentes (métricas curtas,
gráficos altos), a viewport define uma altura mínima confortável (alvo `min-h-[420px]`, ajustável na
implementação) e os painéis de métrica centralizam o conteúdo verticalmente. No desktop a grade usa
altura natural por célula.

### 3.4 Painéis de métrica (novos)

- **`features/dashboard/panels/ResumoPanel.tsx`** e **`.../BalancoPanel.tsx`** — componentes de
  apresentação que recebem `data: DashboardData | undefined` e `isLoading`, com skeleton próprio.
- Redesenho com hierarquia clara: o número principal é o maior; rótulos em `muted-foreground`;
  cores semânticas da marca. O `ProgressRing` (hoje embutido em `SummaryCards`) é reaproveitado
  (movido para `features/dashboard/ProgressRing.tsx` ou mantido no `ResumoPanel`).
- **`SummaryCards.tsx` é removido** (conteúdo redistribuído nos dois painéis).

### 3.5 Gráficos

Reaproveitados como estão (mesmos dados/encoding). Ajuste mínimo: o `Card` raiz recebe `h-full`
para preencher a altura do painel no carrossel. Sem redesenho dos dados (ver §8).

### 3.6 `DashboardPage.tsx` (reescrito)

Mantém header + `MonthYearPicker` + estado de erro. Abaixo, compõe o `Carousel` com os 4
`CarouselItem` (Resumo, Balanço, Evolução, Categoria), passando `data`/`isLoading` dos hooks já
existentes (`useDashboard`, `useYearly`). Estados de loading via skeletons por painel.

---

## 4. Feature B — Puxar-pra-atualizar

### 4.1 Decisões (validadas com o usuário)

- Gesto de toque (`pointer: coarse`), em **todas** as telas. Indicador girando no topo.
- No desktop (mouse) **nada muda** — não há botão de refresh.

### 4.2 Arquitetura — um único ponto de integração

- **`components/PullToRefresh.tsx`** envolve/torna-se o container de scroll `<main>` no `AppLayout`:

  ```tsx
  <PullToRefresh
    as="main"
    className="flex-1 overflow-y-auto overscroll-y-contain p-4 lg:p-6"
    onRefresh={() => queryClient.refetchQueries({ type: 'active' })}
  >
    <Outlet />
  </PullToRefresh>
  ```

- `refetchQueries({ type: 'active' })` recarrega **só as queries montadas** — ou seja, os dados da
  página atual. Assim, **toda página ganha o comportamento automaticamente**, sem fiação por página.
  Retorna `Promise`, então dá pra manter o spinner até resolver.

### 4.3 Lógica do gesto (`hooks/usePullToRefresh.ts`)

Hook que recebe o `ref` do scroller + `onRefresh`, e gerencia a máquina de estados:
`idle → pulling → refreshing → idle`.

- **Ativa somente quando:** o dispositivo é toque (`matchMedia('(pointer: coarse)')`), o
  `scrollTop <= 0` no `touchstart`, e o movimento é predominantemente vertical (`|dy| > |dx|`) —
  isso evita conflito com o swipe horizontal do carrossel.
- **`touchmove`** (listener **não-passivo** via `addEventListener(..., { passive: false })`, porque
  React registra touch como passivo por padrão): calcula o deslocamento com **resistência**
  (ex.: `offset = pull * 0.5`, com teto), chama `preventDefault()` enquanto puxa ativamente (bloqueia
  o pull-to-refresh nativo do Chrome Android; reforçado por `overscroll-behavior-y: contain`).
- **`touchend`**: se `offset >= threshold` (~70px) → estado `refreshing`, chama `onRefresh()` e
  mantém o indicador visível até a Promise resolver **e** um tempo mínimo (~500 ms, pra não
  "piscar"); depois anima de volta pra `idle`. Se abaixo do threshold, volta sem recarregar.
- **Helpers puros exportados** para teste: `computePullOffset(rawDelta, opts)` e
  `shouldTriggerRefresh(offset, threshold)`.

### 4.4 Indicador visual (`PullToRefresh.tsx`)

- Indicador circular centralizado que surge do topo, com opacidade/escala acompanhando o puxão.
- Seta que rotaciona conforme aproxima do threshold → vira spinner (cor `--primary`) durante o
  refresh. Respeita `prefers-reduced-motion` (sem rotação contínua; troca por fade simples).
- Posicionado de forma que não empurre o layout de forma brusca (translate no conteúdo com o puxão,
  ou indicador em overlay no topo do scroller).

---

## 5. Qualidade visual (UX/UI)

- Painéis redesenhados (não apenas o card antigo dentro de um slider): tipografia hierárquica,
  espaçamento generoso, cantos arredondados e sombra suave consistentes, tokens da marca.
- Anel de % com peso visual no painel Resumo.
- Dots com estado ativo em verde.
- Gráficos ocupam a largura inteira do painel (hoje ficam espremidos lado a lado no mobile).

---

## 6. Arquivos

**Novos**
- `web/src/components/ui/carousel.tsx` (+ `carousel.test.tsx`)
- `web/src/components/PullToRefresh.tsx`
- `web/src/hooks/usePullToRefresh.ts` (+ `usePullToRefresh.test.ts`)
- `web/src/features/dashboard/panels/ResumoPanel.tsx` (+ teste)
- `web/src/features/dashboard/panels/BalancoPanel.tsx` (+ teste)
- `web/src/features/dashboard/ProgressRing.tsx` (extraído do `SummaryCards`, se conveniente)

**Alterados**
- `web/src/features/dashboard/DashboardPage.tsx` — compõe o carrossel/grade.
- `web/src/app/AppLayout.tsx` — envolve o `<main>` com `PullToRefresh`.
- `web/src/features/dashboard/YearlyEvolutionChart.tsx` e `CategoryBreakdownChart.tsx` — `h-full`.

**Removidos**
- `web/src/features/dashboard/SummaryCards.tsx` (conteúdo migrado).

**Sem mudança:** API, roteador, autenticação, `queryClient` (só passa a ser chamado no refresh).

---

## 7. Testes (Vitest + Testing Library)

- `usePullToRefresh`: helpers puros (resistência, threshold) e transições de estado; ignora quando
  `scrollTop > 0`, quando não é toque, e chama `onRefresh` uma única vez ao cruzar o threshold.
- `carousel`: renderiza N dots para N itens; clique no dot chama `scrollTo`; dot ativo atualiza ao
  simular scroll.
- `ResumoPanel` / `BalancoPanel`: renderizam os valores formatados corretos a partir de `DashboardData`.

---

## 8. Fora de escopo (YAGNI)

- Dark mode (o CSS só define o tema claro hoje).
- Redesenhar os dados/encoding dos gráficos — apenas reaproveitados e reposicionados.
- Pull-to-refresh no desktop com mouse (sem botão de refresh).
- Qualquer mudança de backend/API.

---

## 9. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Pull-to-refresh nativo do Chrome Android conflita | `overscroll-behavior-y: contain` + `preventDefault` em listener não-passivo |
| Gesto vertical do refresh conflita com swipe horizontal do carrossel | Só engata se `scrollTop<=0` **e** movimento predominantemente vertical |
| React registra touch como passivo (não deixa `preventDefault`) | `addEventListener('touchmove', h, { passive: false })` via ref |
| Painéis de alturas diferentes ficam desalinhados no carrossel | `min-h` na viewport + conteúdo centralizado nos painéis de métrica |
| `refetchQueries` recarregar queries demais | `type: 'active'` limita às montadas (= página atual) |
