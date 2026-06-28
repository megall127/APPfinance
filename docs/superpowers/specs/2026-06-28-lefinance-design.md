# Lefinance — Documento de Design (Spec)

- **Data:** 2026-06-28
- **Autor:** Leandro (com Claude)
- **Status:** Aprovado para planejamento

---

## 1. Visão geral

O **Lefinance** é uma aplicação web de **controle de contas mensais familiar**, derivada de uma planilha
(`Planilhas_de_custos_melhorada.xlsx`). O objetivo é substituir a planilha por um app com login, visual
elaborado e dashboards, que mais tarde virará um **PWA instalável**.

A planilha original organiza os dados como **itens (linhas) × meses (colunas)**, com:
- Receitas (salários);
- Despesas mensais por categoria, com um valor por mês (Jan→Dez);
- Status **Pago / Pendente** por item por mês (aba "Controle 2026");
- Resumos: Total do mês, Já pago, Falta pagar, % pago;
- Assinaturas fixas de cartão de crédito;
- Histórico de vários anos (2023–2026).

O Lefinance reproduz e melhora esse fluxo em um app multiusuário.

### Princípios

- **Não-monolito**: API e Web são aplicações independentes que se comunicam por HTTP/JSON.
- **Boas práticas de arquitetura**: camadas, separação de responsabilidades, design patterns idiomáticos.
- **Future-proof**: estrutura pronta para PWA e para compartilhamento de workspace (sem implementar tudo agora).
- **YAGNI**: só o que serve ao v1; o resto vira roadmap.

---

## 2. Escopo

### Dentro do v1

- **Autenticação**: cadastro aberto (email + senha), login, logout, "quem sou eu".
- **Workspace por usuário**: cada usuário tem um workspace próprio criado no registro. Modelo já prevê
  `workspace_members` para compartilhamento futuro, mas no v1 há 1 dono por workspace.
- **Receitas**: itens de receita (ex: salários) com valor mensal.
- **Despesas mensais**: itens de despesa por categoria, com valor por mês e **status Pago/Pendente**.
- **Assinaturas fixas de cartão**: lista dedicada de itens recorrentes (Netflix, Amazon, etc.).
- **Categorias customizáveis**: usuário cria/edita categorias (nome, cor, ícone).
- **Dashboard**: cards de Total do mês / Já pago / Falta pagar / % pago (anel de progresso),
  gráfico de evolução mensal e breakdown por categoria; seletor de ano e mês.
- **Histórico multi-ano**: armazenar e comparar anos (2024/2025/2026) com gráficos.
- **Importar planilha**: upload do `.xlsx` atual → preview → confirmação → cria itens + lançamentos.
- **PWA-ready**: estrutura (manifest + service worker via vite-plugin-pwa) preparada, ativável depois.

### Fora do v1 (roadmap)

- Compartilhamento real de workspace (convites, papéis, permissões em uso).
- Instalação/distribuição do PWA e push notifications.
- Cadastro por convite/aprovação (admin).
- Relatórios avançados / exportação.
- App mobile nativo.

---

## 3. Arquitetura geral

```
lefinance/                      (monorepo)
├── api/    AdonisJS 6 (REST API, TypeScript, Lucid ORM)  ──┐  HTTP/JSON
│                                                            │  Bearer access token
├── web/    React + Vite + TS (SPA → PWA)            ◄───────┘
│
└── docs/   specs, planos, decisões

        MySQL (XAMPP, localhost:3306)
```

- **API** é a única que fala com o banco. A **Web** só conhece a API.
- **Autenticação** por Access Token opaco (guarda de `auth` do Adonis), enviado como `Authorization: Bearer <token>`.
- Origens separadas → **CORS** habilitado na API para o origin do front.

---

## 4. Backend — AdonisJS 6 + Lucid + MySQL

### 4.1 Stack

- **AdonisJS 6** (TypeScript, ESM).
- **Lucid ORM** (driver `mysql2`).
- **VineJS** para validação.
- **@adonisjs/auth** com guard de **access tokens**.
- **@adonisjs/bouncer** para autorização (policies).
- **@adonisjs/cors**.
- Parsing de `.xlsx` na importação: biblioteca **SheetJS (`xlsx`)** ou `exceljs`.

### 4.2 Arquitetura em camadas (por requisição)

```
HTTP Request
  → Controller        (fino: orquestra, sem regra de negócio)
  → Validator (Vine)  (valida e tipa a entrada)
  → Service           (regra de negócio / casos de uso)
  → Model (Lucid)     (acesso a dados, Active Record)
  → Policy (Bouncer)  (autorização: usuário só acessa o próprio workspace)
  ← Serializer/DTO    (resposta padronizada, sem dados sensíveis)
```

### 4.3 Organização por módulo (feature)

```
api/
├── app/
│   ├── modules/
│   │   ├── auth/        controllers, services, validators
│   │   ├── workspaces/  model, service, policy
│   │   ├── categories/  controller, service, validator, model, policy
│   │   ├── items/       controller, service, validator, model, policy
│   │   ├── entries/     controller, service, validator, model, policy
│   │   ├── dashboard/   controller, service (agregações)
│   │   └── import/      controller, service (parser xlsx + mapeamento)
│   ├── middleware/      auth, current_workspace, ...
│   └── models/          (ou dentro de cada módulo)
├── database/
│   ├── migrations/
│   └── seeders/         (categorias padrão)
├── config/  start/  tests/
└── .env
```

> Observação: módulos agrupam por feature; models podem viver dentro do módulo ou em `app/models`.
> A decisão final fica para o plano de implementação, mantendo consistência.

### 4.4 Design patterns

- **Service Layer** — regra de negócio isolada e testável.
- **Dependency Injection** — container IoC do Adonis (services injetáveis).
- **Policy / Authorization** — Bouncer; toda query é escopada ao `workspace` do usuário.
- **Validation objects** — VineJS schemas por endpoint.
- **DTO / Serializer** — `User` nunca serializa `password`; respostas consistentes.
- **Migrations + Seeders** — schema versionado; seed cria categorias padrão.
- **Repository (opcional)** — se um módulo crescer; Lucid Active Record é o default.

### 4.5 Autenticação e autorização

- **Registro** (`POST /auth/register`): cria `user`, hash de senha (scrypt/argon do Adonis),
  cria `workspace` padrão (dono = user), cria categorias padrão (seed por workspace), retorna token.
- **Login** (`POST /auth/login`): valida credenciais, emite access token.
- **Logout** (`POST /auth/logout`): revoga o token atual.
- **Me** (`GET /auth/me`): retorna usuário + workspace atual.
- **Escopo de workspace**: middleware `current_workspace` resolve o workspace do usuário
  (no v1, o único do qual ele é dono) e injeta no contexto; toda consulta filtra por `workspace_id`.

### 4.6 Endpoints (REST) — v1

| Método | Rota | Descrição |
|---|---|---|
| POST | `/auth/register` | cria conta + workspace + categorias padrão |
| POST | `/auth/login` | autentica, retorna token |
| POST | `/auth/logout` | revoga token |
| GET | `/auth/me` | usuário + workspace |
| GET | `/categories` | lista categorias |
| POST | `/categories` | cria categoria |
| PATCH | `/categories/:id` | edita |
| DELETE | `/categories/:id` | arquiva/remove |
| GET | `/items?kind=expense\|income\|card_subscription` | lista itens |
| POST | `/items` | cria item |
| PATCH | `/items/:id` | edita item |
| DELETE | `/items/:id` | desativa/remove item |
| GET | `/entries?year=&month=` | lançamentos do mês (itens + entry de cada um) |
| POST | `/entries/upsert` | cria/atualiza valor de uma célula (item, ano, mês) |
| PATCH | `/entries/:id` | edita valor/status/nota |
| POST | `/entries/:id/toggle-paid` | alterna Pago/Pendente |
| GET | `/dashboard?year=&month=` | resumo do mês (total, pago, falta, %; breakdown por categoria) |
| GET | `/dashboard/yearly?year=` | evolução dos 12 meses (total/pago) |
| POST | `/import/preview` | upload `.xlsx` → retorna preview do mapeamento |
| POST | `/import/commit` | confirma e grava itens + lançamentos |

> Respostas paginadas onde fizer sentido; erros padronizados (`{ errors: [...] }`).

---

## 5. Modelo de dados (MySQL)

Valores monetários em `DECIMAL(12,2)`. Datas em UTC. Todas as tabelas de domínio têm `workspace_id`.

### `users`
| coluna | tipo | notas |
|---|---|---|
| id | bigint PK | |
| full_name | varchar | |
| email | varchar unique | |
| password | varchar | hash |
| created_at / updated_at | timestamp | |

### `auth_access_tokens`
Tabela padrão do guard de tokens do Adonis (id, tokenable_id, hash, abilities, expires_at, ...).

### `workspaces`
| coluna | tipo | notas |
|---|---|---|
| id | bigint PK | |
| name | varchar | ex: "Finanças do Leandro" |
| owner_user_id | bigint FK → users | |
| created_at / updated_at | timestamp | |

### `workspace_members` (pronto para compartilhamento futuro)
| coluna | tipo | notas |
|---|---|---|
| id | bigint PK | |
| workspace_id | bigint FK | |
| user_id | bigint FK | |
| role | enum(`owner`,`member`) | v1: só `owner` |
| unique | (workspace_id, user_id) | |

### `categories`
| coluna | tipo | notas |
|---|---|---|
| id | bigint PK | |
| workspace_id | bigint FK | |
| name | varchar | |
| color | varchar(7) | hex |
| icon | varchar | nome do ícone (lucide) |
| sort_order | int | |
| archived | boolean | default false |

### `items` (template recorrente: receita / despesa / assinatura de cartão)
| coluna | tipo | notas |
|---|---|---|
| id | bigint PK | |
| workspace_id | bigint FK | |
| category_id | bigint FK nullable | |
| name | varchar | ex: "Internet", "Salário Leandro" |
| kind | enum(`income`,`expense`,`card_subscription`) | |
| default_amount | decimal(12,2) nullable | "valor base" |
| is_active | boolean | default true |
| sort_order | int | |

### `monthly_entries` (tabela-fato central — cada célula da planilha)
| coluna | tipo | notas |
|---|---|---|
| id | bigint PK | |
| workspace_id | bigint FK | |
| item_id | bigint FK → items | |
| year | smallint | ex: 2026 |
| month | tinyint | 1–12 |
| amount | decimal(12,2) | valor do mês |
| status | enum(`paid`,`pending`) | default `pending` |
| paid_at | timestamp nullable | |
| note | varchar nullable | observações livres da planilha |
| unique | (item_id, year, month) | |

**Agregações do dashboard** (por `workspace_id`, `year`, `month`):
- `total_do_mes` = soma de `amount` apenas de `kind=expense`.
- `ja_pago` = soma onde `kind=expense` e `status=paid`.
- `falta_pagar` = total − pago.
- `percentual_pago` = pago / total (0 se total = 0).
- `receitas` = soma de `kind=income`.
- `saldo` = receitas − total_do_mes.
- `assinaturas_cartao` = soma de `kind=card_subscription`, exibida **separadamente**.

> **Regra anti-dupla-contagem:** assinaturas de cartão (`card_subscription`) **não** entram em
> `total_do_mes`. Elas são uma lista informativa do que compõe a fatura; o valor real da fatura já é
> lançado como um item de despesa "Cartão" (`kind=expense`). Assim evitamos somar duas vezes.

---

## 6. Frontend — React + Vite + TypeScript

### 6.1 Stack

| Camada | Escolha |
|---|---|
| Build | Vite |
| Linguagem | TypeScript |
| UI | Tailwind CSS + **shadcn/ui** (Radix) |
| Ícones | lucide-react |
| Gráficos | Recharts |
| Estado servidor | TanStack Query |
| HTTP | Axios (interceptor de token + refresh de erro 401) |
| Rotas | React Router |
| Formulários | React Hook Form + Zod |
| PWA | vite-plugin-pwa (manifest + service worker) |

### 6.2 Organização por feature

```
web/src/
├── app/            providers, router, layout
├── features/
│   ├── auth/       login, register, hooks, store de sessão
│   ├── dashboard/  cards, gráficos, seletor ano/mês
│   ├── entries/    grid de lançamentos do mês, toggle Pago/Pendente
│   ├── items/      CRUD de itens (receita/despesa)
│   ├── subscriptions/ assinaturas de cartão
│   ├── categories/ CRUD de categorias
│   ├── history/    comparativo multi-ano
│   └── import/     upload + preview + commit
├── components/ui/  componentes shadcn
├── lib/            api client, query client, theme, utils, format (BRL/datas)
└── styles/         tokens, tailwind
```

### 6.3 PWA

- `vite-plugin-pwa` configurado com `manifest` (nome, ícones, theme_color verde, background branco) e
  estratégia de service worker (`autoUpdate`). No v1 fica pronto/registrável; ativação plena no roadmap.

---

## 7. Direção visual

Paleta **branco + verde suave + amarelo**, mapeando a semântica do app.

### Design tokens (CSS variables)

| Token | Valor (aprox.) | Uso |
|---|---|---|
| `--bg` | `#FBFDFB` | fundo |
| `--surface` | `#FFFFFF` | cards |
| `--primary` | `#4CAF82` | primário / **status Pago** |
| `--primary-strong` | `#2E8B63` | hover/realce |
| `--accent` | `#F5C84C` | acento / **status Pendente** |
| `--text` | `#1F2937` | texto principal |
| `--muted` | `#6B7280` | texto secundário |
| `--danger` | `#E5534B` | saldo negativo / exclusão |

- Cards arredondados (`rounded-2xl`), sombras suaves, microtransições.
- **Pago** = verde; **Pendente** = amarelo (consistente em badges, toggles e gráficos).
- Tipografia limpa (ex: Inter). Modo claro no v1 (dark no roadmap).

### Telas

1. **Login / Cadastro** — layout split com gradiente suave verde→branco.
2. **Dashboard** — cards (Total do mês, Já pago, Falta pagar, anel de % pago), gráfico de evolução
   mensal, breakdown por categoria, seletor de ano/mês.
3. **Lançamentos do mês** — grid de itens com edição de valor inline e toggle Pago/Pendente.
4. **Itens & Categorias** — CRUD com cores/ícones.
5. **Assinaturas de cartão** — lista dedicada.
6. **Histórico** — comparativo entre anos com gráficos.
7. **Importar planilha** — upload `.xlsx` → preview do mapeamento → confirmar.

---

## 8. Importação da planilha

Mapeamento do `.xlsx` → modelo:

- Cada **linha de item** (ex: "Internet", "Luz") → `items` (kind inferido pelo bloco: receita/despesa/cartão).
- Cada **célula mês×item** com valor → `monthly_entries` (year do bloco, month da coluna, amount da célula).
- Status **Pago/Pendente** (aba "Controle 2026", colunas P–AA) → `status` do entry correspondente.
- Blocos por ano (2023–2026) → `year` correspondente.
- Assinaturas de cartão ("Fixos cartão de crédito") → `items` com `kind=card_subscription`.

Fluxo: `POST /import/preview` faz parsing e devolve um preview (itens e contagem de lançamentos por ano);
o usuário confere; `POST /import/commit` grava de forma idempotente (upsert por item+ano+mês).

---

## 9. Ambiente / configuração

- **Banco**: MySQL do **XAMPP** em `localhost:3306` (usuário `root`, senha vazia por padrão). Criar o
  schema `lefinance` (via phpMyAdmin ou migration).
- **API `.env`**: `DB_HOST`, `DB_PORT=3306`, `DB_USER=root`, `DB_PASSWORD=`, `DB_DATABASE=lefinance`,
  `APP_KEY`, `PORT=3333`, `CORS` origin do front.
- **Web `.env`**: `VITE_API_URL=http://localhost:3333`.
- **Execução local**: `api` em `:3333`, `web` (Vite) em `:5173`.

---

## 10. Critérios de aceite (v1)

- [ ] Usuário se cadastra, faz login e é direcionado ao dashboard (token persistido).
- [ ] Cada usuário só vê os dados do seu próprio workspace.
- [ ] CRUD de categorias e itens (receita, despesa, assinatura de cartão) funcionando.
- [ ] Grid de lançamentos do mês permite editar valor e alternar Pago/Pendente, refletindo no dashboard.
- [ ] Dashboard mostra Total do mês, Já pago, Falta pagar, % pago e gráficos, com seletor ano/mês.
- [ ] Histórico permite comparar anos.
- [ ] Importação do `.xlsx` cria itens e lançamentos corretamente (com status).
- [ ] Visual segue a paleta (branco/verde/amarelo) com Pago=verde e Pendente=amarelo.
- [ ] Estrutura PWA (manifest + SW) presente, registrável.
- [ ] API com camadas (controller/service/model), validação e autorização por workspace.

---

## 11. Riscos e decisões em aberto

- **Token no front**: armazenamento do access token (localStorage vs cookie). Decisão: começar com
  Bearer em memória + persistência simples; revisitar segurança no roadmap.
- **Parsing do `.xlsx`**: a planilha tem células heterogêneas (texto como "65 (guardado BB)", "x", "-").
  O importador precisa ser tolerante (ignorar/normalizar não-numéricos). Tratar no service de import.
- **Receita vs status**: receitas usam o mesmo modelo; `status` pode ficar como `pending` por padrão
  e não impacta o cálculo de despesas.

---

## 12. Roadmap pós-v1

- Compartilhamento real de workspace (convites + papéis).
- Ativação completa do PWA (instalação, offline, push).
- Cadastro por convite/aprovação.
- Dark mode, relatórios e exportação.
