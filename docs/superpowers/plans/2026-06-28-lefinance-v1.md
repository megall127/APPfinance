# Lefinance v1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir o Lefinance v1 — app web de controle de contas mensais familiar, com API (AdonisJS 6 + MySQL) e Web (React + Vite, PWA-ready) separadas, derivado da planilha `Planilhas_de_custos_melhorada.xlsx`.

**Architecture:** Monorepo com `api/` (AdonisJS 6, Lucid, MySQL) e `web/` (React + Vite + TS). A Web consome a API por REST/JSON com Bearer access token. Backend em camadas (controller → service → model) com Bouncer para escopo por workspace. Modelo central: `items` (templates) × `monthly_entries` (fato: valor + status Pago/Pendente por ano/mês).

**Tech Stack:** AdonisJS 6, Lucid ORM, MySQL (XAMPP), VineJS, Bouncer, Japa (testes). React 18, Vite, TypeScript, Tailwind, shadcn/ui, TanStack Query, React Router, React Hook Form + Zod, Recharts, vite-plugin-pwa, Vitest + React Testing Library.

## Global Constraints

- **Node** ≥ 20. **AdonisJS** 6 (ESM). **React** 18, **Vite** 5+.
- **Banco:** MySQL do XAMPP em `localhost:3306`, usuário `root`, senha vazia, schema `lefinance` (criar antes das migrations).
- **Portas:** API em `:3333`, Web (Vite) em `:5173`.
- **CORS:** API libera origin `http://localhost:5173`.
- **Dinheiro:** `DECIMAL(12,2)`. Locale **pt-BR**, moeda **BRL**.
- **Colunas DB:** `snake_case`; models Lucid em `camelCase` (naming strategy padrão).
- **Escopo:** toda query de domínio é filtrada por `workspace_id` do usuário autenticado.
- **Anti-dupla-contagem:** `kind=card_subscription` NÃO entra em `total_do_mes` (só informativo).
- **TDD:** backend test-first (Japa). Web: Vitest para utils/hooks/lógica; telas verificadas rodando o app.
- **Commits:** Conventional Commits, frequentes (um por tarefa concluída).
- **Status enum:** `paid` | `pending`. **Kind enum:** `income` | `expense` | `card_subscription`.

---

# FASE 0 — Monorepo & Ferramentas

### Task 0: Estrutura do monorepo

**Files:**
- Create: `package.json` (raiz, workspaces), `README.md`
- Já existem: `.gitignore`, `docs/`

**Interfaces:**
- Produces: scripts raiz `dev:api`, `dev:web`; pastas `api/` e `web/`.

- [ ] **Step 1: Criar `package.json` raiz**

```json
{
  "name": "lefinance",
  "private": true,
  "version": "1.0.0",
  "workspaces": ["api", "web"],
  "scripts": {
    "dev:api": "npm --workspace api run dev",
    "dev:web": "npm --workspace web run dev"
  }
}
```

- [ ] **Step 2: Criar `README.md`** com instruções rápidas (pré-requisitos: Node 20, XAMPP/MySQL; criar schema `lefinance`; `npm run dev:api` e `npm run dev:web`).

- [ ] **Step 3: Commit**

```bash
git add package.json README.md
git commit -m "chore: estrutura inicial do monorepo"
```

---

# FASE 1 — Fundação da API (AdonisJS 6)

### Task 1: Scaffold da API com kit api + MySQL

**Files:**
- Create: `api/` (gerado pelo create-adonisjs)

**Interfaces:**
- Produces: app Adonis com Lucid (mysql2), auth por **access tokens**, `User` model, CORS, Japa configurados.

- [ ] **Step 1: Gerar o projeto** (na raiz do monorepo)

```bash
npm init adonisjs@latest api -- --kit=api --db=mysql
```

(O kit `api` já vem com `@adonisjs/auth` em modo **access tokens**, Lucid, CORS e Japa.)

- [ ] **Step 2: Configurar `api/.env`** para o XAMPP

```
TZ=UTC
PORT=3333
HOST=localhost
LOG_LEVEL=info
APP_KEY=<gerado pelo instalador>
NODE_ENV=development
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_DATABASE=lefinance
```

- [ ] **Step 3: Criar o schema** no MySQL (phpMyAdmin do XAMPP ou CLI): `CREATE DATABASE lefinance;`

- [ ] **Step 4: Configurar CORS** em `api/config/cors.ts`: `origin: ['http://localhost:5173']`, `credentials: true`.

- [ ] **Step 5: Rodar migrations base e subir** para validar conexão

```bash
cd api && node ace migration:run && node ace serve --hmr
```

Expected: servidor em `http://localhost:3333`, migration de `users`/`auth_access_tokens` aplicada sem erro.

- [ ] **Step 6: Commit**

```bash
git add api && git commit -m "feat(api): scaffold AdonisJS 6 (kit api, mysql, auth tokens)"
```

### Task 2: Instalar Bouncer + estrutura de módulos

**Files:**
- Modify: `api/` (config do bouncer)
- Create: `api/app/modules/` (pasta base por feature)

**Interfaces:**
- Produces: `@adonisjs/bouncer` disponível; convenção de pastas `app/modules/<feature>/`.

- [ ] **Step 1: Adicionar Bouncer**

```bash
cd api && node ace add @adonisjs/bouncer
```

- [ ] **Step 2: Criar pastas** `app/modules/{auth,workspaces,categories,items,entries,dashboard,import}` (vazias por enquanto, com um `.gitkeep`).

- [ ] **Step 3: Commit**

```bash
git add api && git commit -m "chore(api): bouncer + estrutura de modulos por feature"
```

---

# FASE 2 — Workspaces, Auth e Categorias padrão

### Task 3: Migrations de domínio (workspaces, members, categories, items, entries)

**Files:**
- Create: `api/database/migrations/*_create_workspaces.ts`, `*_create_workspace_members.ts`, `*_create_categories.ts`, `*_create_items.ts`, `*_create_monthly_entries.ts`

**Interfaces:**
- Produces: tabelas conforme spec §5.

- [ ] **Step 1: Gerar migrations**

```bash
cd api
node ace make:migration create_workspaces
node ace make:migration create_workspace_members
node ace make:migration create_categories
node ace make:migration create_items
node ace make:migration create_monthly_entries
```

- [ ] **Step 2: `workspaces`**

```ts
this.schema.createTable('workspaces', (t) => {
  t.bigIncrements('id')
  t.string('name').notNullable()
  t.bigInteger('owner_user_id').unsigned().references('id').inTable('users').onDelete('CASCADE')
  t.timestamp('created_at'); t.timestamp('updated_at')
})
```

- [ ] **Step 3: `workspace_members`**

```ts
this.schema.createTable('workspace_members', (t) => {
  t.bigIncrements('id')
  t.bigInteger('workspace_id').unsigned().references('id').inTable('workspaces').onDelete('CASCADE')
  t.bigInteger('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE')
  t.enum('role', ['owner', 'member']).notNullable().defaultTo('owner')
  t.unique(['workspace_id', 'user_id'])
  t.timestamp('created_at'); t.timestamp('updated_at')
})
```

- [ ] **Step 4: `categories`**

```ts
this.schema.createTable('categories', (t) => {
  t.bigIncrements('id')
  t.bigInteger('workspace_id').unsigned().references('id').inTable('workspaces').onDelete('CASCADE')
  t.string('name').notNullable()
  t.string('color', 7).notNullable().defaultTo('#4CAF82')
  t.string('icon').nullable()
  t.integer('sort_order').notNullable().defaultTo(0)
  t.boolean('archived').notNullable().defaultTo(false)
  t.timestamp('created_at'); t.timestamp('updated_at')
})
```

- [ ] **Step 5: `items`**

```ts
this.schema.createTable('items', (t) => {
  t.bigIncrements('id')
  t.bigInteger('workspace_id').unsigned().references('id').inTable('workspaces').onDelete('CASCADE')
  t.bigInteger('category_id').unsigned().nullable().references('id').inTable('categories').onDelete('SET NULL')
  t.string('name').notNullable()
  t.enum('kind', ['income', 'expense', 'card_subscription']).notNullable()
  t.decimal('default_amount', 12, 2).nullable()
  t.boolean('is_active').notNullable().defaultTo(true)
  t.integer('sort_order').notNullable().defaultTo(0)
  t.timestamp('created_at'); t.timestamp('updated_at')
})
```

- [ ] **Step 6: `monthly_entries`**

```ts
this.schema.createTable('monthly_entries', (t) => {
  t.bigIncrements('id')
  t.bigInteger('workspace_id').unsigned().references('id').inTable('workspaces').onDelete('CASCADE')
  t.bigInteger('item_id').unsigned().references('id').inTable('items').onDelete('CASCADE')
  t.smallint('year').notNullable()
  t.tinyint('month').notNullable() // 1-12
  t.decimal('amount', 12, 2).notNullable().defaultTo(0)
  t.enum('status', ['paid', 'pending']).notNullable().defaultTo('pending')
  t.timestamp('paid_at').nullable()
  t.string('note').nullable()
  t.unique(['item_id', 'year', 'month'])
  t.timestamp('created_at'); t.timestamp('updated_at')
})
```

- [ ] **Step 7: Rodar e validar**

```bash
node ace migration:run
```

Expected: 5 migrations aplicadas, sem erro.

- [ ] **Step 8: Commit**

```bash
git add api/database && git commit -m "feat(api): migrations de dominio (workspaces, categories, items, entries)"
```

### Task 4: Models Lucid + relações

**Files:**
- Create: `api/app/models/workspace.ts`, `workspace_member.ts`, `category.ts`, `item.ts`, `monthly_entry.ts`
- Modify: `api/app/models/user.ts` (relação hasMany workspaces)

**Interfaces:**
- Produces: models com `@column`, relações `@belongsTo`/`@hasMany`. Tipos: `Item.kind: 'income'|'expense'|'card_subscription'`, `MonthlyEntry.status: 'paid'|'pending'`.

- [ ] **Step 1: `Workspace`** (`app/models/workspace.ts`)

```ts
import { BaseModel, column, belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import User from './user.js'
import Item from './item.js'
import Category from './category.js'

export default class Workspace extends BaseModel {
  @column({ isPrimary: true }) declare id: number
  @column() declare name: string
  @column() declare ownerUserId: number
  @belongsTo(() => User, { foreignKey: 'ownerUserId' }) declare owner: BelongsTo<typeof User>
  @hasMany(() => Item) declare items: HasMany<typeof Item>
  @hasMany(() => Category) declare categories: HasMany<typeof Category>
  @column.dateTime({ autoCreate: true }) declare createdAt: DateTime
  @column.dateTime({ autoCreate: true, autoUpdate: true }) declare updatedAt: DateTime
}
```

(importar `DateTime` de `luxon`.)

- [ ] **Step 2: `Category`, `Item`, `MonthlyEntry`, `WorkspaceMember`** — análogos, com colunas da migration e relações: `Item belongsTo Category`, `Item hasMany MonthlyEntry`, `Category hasMany Item`, `MonthlyEntry belongsTo Item`. Em `Item`, declarar `kind` e em `MonthlyEntry` declarar `status` com os tipos union acima.

- [ ] **Step 3: `User`** — adicionar `@hasMany(() => Workspace, { foreignKey: 'ownerUserId' }) declare workspaces`.

- [ ] **Step 4: Teste de sanidade** (`tests/unit/models.spec.ts`)

```ts
import { test } from '@japa/runner'
import Workspace from '#models/workspace'
test.group('Models', () => {
  test('Workspace tem colunas esperadas', ({ assert }) => {
    const w = new Workspace()
    w.name = 'x'; w.ownerUserId = 1
    assert.equal(w.name, 'x')
  })
})
```

- [ ] **Step 5: Rodar** `node ace test` → PASS. **Commit** `feat(api): models lucid de dominio`.

### Task 5: WorkspaceService — provisionamento (workspace + categorias padrão)

**Files:**
- Create: `api/app/modules/workspaces/workspace_service.ts`
- Create: `api/app/modules/workspaces/default_categories.ts`
- Test: `api/tests/functional/workspaces.spec.ts` (via auth na Task 6) ou unit aqui.

**Interfaces:**
- Produces: `WorkspaceService.provisionForUser(user: User): Promise<Workspace>` — cria workspace "Finanças de {nome}", marca membro `owner`, e cria categorias padrão.

- [ ] **Step 1: `default_categories.ts`**

```ts
export const DEFAULT_CATEGORIES = [
  { name: 'Moradia', color: '#4CAF82', icon: 'home' },
  { name: 'Saúde', color: '#3BA3D0', icon: 'heart-pulse' },
  { name: 'Educação', color: '#9B7EDE', icon: 'graduation-cap' },
  { name: 'Cartão', color: '#F5C84C', icon: 'credit-card' },
  { name: 'Transporte', color: '#E58A4B', icon: 'car' },
  { name: 'Outros', color: '#6B7280', icon: 'ellipsis' },
]
```

- [ ] **Step 2: `workspace_service.ts`**

```ts
import Workspace from '#models/workspace'
import Category from '#models/category'
import WorkspaceMember from '#models/workspace_member'
import type User from '#models/user'
import db from '@adonisjs/lucid/services/db'
import { DEFAULT_CATEGORIES } from './default_categories.js'

export default class WorkspaceService {
  async provisionForUser(user: User): Promise<Workspace> {
    return db.transaction(async (trx) => {
      const workspace = await Workspace.create(
        { name: `Finanças de ${user.fullName ?? 'você'}`, ownerUserId: user.id },
        { client: trx }
      )
      await WorkspaceMember.create(
        { workspaceId: workspace.id, userId: user.id, role: 'owner' },
        { client: trx }
      )
      await Category.createMany(
        DEFAULT_CATEGORIES.map((c, i) => ({ ...c, workspaceId: workspace.id, sortOrder: i })),
        { client: trx }
      )
      return workspace
    })
  }
}
```

- [ ] **Step 3: Teste unit** (`tests/unit/workspace_service.spec.ts`) usando `testUtils.db().withGlobalTransaction()`: cria um `User`, chama `provisionForUser`, assert 1 workspace + 6 categorias + membro owner. Rodar → PASS.

- [ ] **Step 4: Commit** `feat(api): WorkspaceService com categorias padrao`.

### Task 6: Auth — register/login/me/logout

**Files:**
- Create: `api/app/modules/auth/auth_controller.ts`, `register_validator.ts`, `login_validator.ts`
- Modify: `api/start/routes.ts`
- Test: `api/tests/functional/auth.spec.ts`

**Interfaces:**
- Consumes: `User.verifyCredentials`, `User.accessTokens.create`, `WorkspaceService.provisionForUser`.
- Produces: rotas `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`. Resposta de register/login: `{ user, token: { type:'bearer', value }, workspace }`.

- [ ] **Step 1: Escrever teste funcional** (`tests/functional/auth.spec.ts`)

```ts
import { test } from '@japa/runner'

test.group('Auth', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('registra e retorna token + workspace', async ({ client, assert }) => {
    const res = await client.post('/auth/register').json({
      fullName: 'Leandro', email: 'le@test.com', password: 'secret123',
    })
    res.assertStatus(201)
    assert.exists(res.body().token.value)
    assert.equal(res.body().user.email, 'le@test.com')
    assert.exists(res.body().workspace.id)
  })

  test('login com credenciais válidas', async ({ client }) => {
    await client.post('/auth/register').json({ fullName: 'A', email: 'a@test.com', password: 'secret123' })
    const res = await client.post('/auth/login').json({ email: 'a@test.com', password: 'secret123' })
    res.assertStatus(200)
  })

  test('me exige token', async ({ client }) => {
    const res = await client.get('/auth/me')
    res.assertStatus(401)
  })
})
```

- [ ] **Step 2: Rodar** `node ace test` → FAIL (rotas inexistentes).

- [ ] **Step 3: Validators (VineJS)** — `register_validator.ts`

```ts
import vine from '@vinejs/vine'
export const registerValidator = vine.compile(
  vine.object({
    fullName: vine.string().trim().minLength(2),
    email: vine.string().trim().email().normalizeEmail(),
    password: vine.string().minLength(6),
  })
)
export const loginValidator = vine.compile(
  vine.object({ email: vine.string().trim().email(), password: vine.string() })
)
```

- [ ] **Step 4: Controller** (`auth_controller.ts`)

```ts
import type { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import User from '#models/user'
import WorkspaceService from '#modules/workspaces/workspace_service'
import { registerValidator, loginValidator } from './register_validator.js'

@inject()
export default class AuthController {
  constructor(private workspaces: WorkspaceService) {}

  async register({ request, response }: HttpContext) {
    const data = await request.validateUsing(registerValidator)
    const user = await User.create(data)
    const workspace = await this.workspaces.provisionForUser(user)
    const token = await User.accessTokens.create(user)
    return response.created({ user, token, workspace })
  }

  async login({ request }: HttpContext) {
    const { email, password } = await request.validateUsing(loginValidator)
    const user = await User.verifyCredentials(email, password)
    const token = await User.accessTokens.create(user)
    const workspace = await user.related('workspaces').query().firstOrFail()
    return { user, token, workspace }
  }

  async me({ auth }: HttpContext) {
    const user = auth.getUserOrFail()
    const workspace = await user.related('workspaces').query().firstOrFail()
    return { user, workspace }
  }

  async logout({ auth }: HttpContext) {
    const user = auth.getUserOrFail()
    await User.accessTokens.delete(user, user.currentAccessToken.identifier)
    return { revoked: true }
  }
}
```

- [ ] **Step 5: Rotas** (`start/routes.ts`)

```ts
import router from '@adonisjs/core/services/router'
import { middleware } from './kernel.js'
const AuthController = () => import('#modules/auth/auth_controller')

router.post('/auth/register', [AuthController, 'register'])
router.post('/auth/login', [AuthController, 'login'])
router.group(() => {
  router.get('/auth/me', [AuthController, 'me'])
  router.post('/auth/logout', [AuthController, 'logout'])
}).use(middleware.auth())
```

- [ ] **Step 6: Rodar** `node ace test` → PASS. **Commit** `feat(api): auth register/login/me/logout + provisionamento de workspace`.

### Task 7: Middleware de workspace atual + Policy base

**Files:**
- Create: `api/app/middleware/current_workspace_middleware.ts`
- Create: `api/app/policies/workspace_policy.ts`
- Modify: `api/start/kernel.ts` (registrar named middleware)

**Interfaces:**
- Produces: middleware que resolve `ctx.workspace` (primeiro workspace do user) e injeta em `HttpContext`. Helper `ensureOwnsWorkspace(workspaceId)`.

- [ ] **Step 1: Estender `HttpContext`** com `workspace` (declare module em `current_workspace_middleware.ts`); resolver via `auth.user.related('workspaces').query().firstOrFail()` e setar `ctx.workspace`.

- [ ] **Step 2: Registrar named middleware** `currentWorkspace` no `kernel.ts`.

- [ ] **Step 3: Teste** — rota protegida sem workspace retorna 401/403 apropriado; com user válido injeta workspace. (Coberto indiretamente nos testes de categories/items.)

- [ ] **Step 4: Commit** `feat(api): middleware de workspace atual`.

---

# FASE 3 — Categorias & Itens (CRUD)

### Task 8: Categories CRUD

**Files:**
- Create: `api/app/modules/categories/categories_controller.ts`, `category_validator.ts`, `category_service.ts`
- Modify: `start/routes.ts`
- Test: `tests/functional/categories.spec.ts`

**Interfaces:**
- Consumes: `ctx.workspace`.
- Produces: `GET/POST /categories`, `PATCH/DELETE /categories/:id`. Service: `list(workspaceId)`, `create(workspaceId, dto)`, `update(workspaceId, id, dto)`, `archive(workspaceId, id)`. Toda query filtra por `workspaceId`.

- [ ] **Step 1: Teste funcional** — registrar user (helper `registerAndAuth(client)` que devolve `{token, workspace}`), criar categoria, listar (só do próprio workspace), tentar acessar id de outro workspace → 404. Rodar → FAIL.

```ts
test('cria e lista categorias do proprio workspace', async ({ client, assert }) => {
  const { token } = await registerAndAuth(client, 'c1@test.com')
  const created = await client.post('/categories').bearerToken(token).json({ name: 'Lazer', color: '#F5C84C' })
  created.assertStatus(201)
  const list = await client.get('/categories').bearerToken(token)
  assert.isAtLeast(list.body().length, 7) // 6 padrão + 1
})
```

- [ ] **Step 2: Validator** — `name` string min 1, `color` regex `^#[0-9A-Fa-f]{6}$` opcional, `icon` opcional, `sortOrder` number opcional.

- [ ] **Step 3: Service + Controller** — CRUD escopado por `workspaceId`; `DELETE` faz `archived=true` se houver itens, senão remove. `update`/`archive` usam `Category.query().where('workspace_id', ws.id).where('id', id).firstOrFail()`.

- [ ] **Step 4: Rotas** dentro do grupo `.use([middleware.auth(), middleware.currentWorkspace()])`.

- [ ] **Step 5: Rodar testes → PASS. Commit** `feat(api): CRUD de categorias escopado por workspace`.

### Task 9: Items CRUD (income/expense/card_subscription)

**Files:**
- Create: `api/app/modules/items/items_controller.ts`, `item_validator.ts`, `item_service.ts`
- Modify: `start/routes.ts`
- Test: `tests/functional/items.spec.ts`

**Interfaces:**
- Produces: `GET /items?kind=`, `POST /items`, `PATCH /items/:id`, `DELETE /items/:id`. Validator: `name` req, `kind` in enum req, `categoryId` opcional (deve pertencer ao workspace), `defaultAmount` decimal opcional, `isActive` bool, `sortOrder` number.

- [ ] **Step 1: Teste funcional** — criar item `kind=expense`, filtrar por `kind`, validar que `categoryId` de outro workspace é rejeitado. Rodar → FAIL.

- [ ] **Step 2: Validator + Service + Controller** — `list(workspaceId, kind?)`, `create`, `update`, `deactivate` (DELETE → `is_active=false` se tiver entries, senão remove). Validar `categoryId` pertence ao workspace.

- [ ] **Step 3: Rotas no grupo autenticado. Rodar testes → PASS. Commit** `feat(api): CRUD de itens por kind`.

---

# FASE 4 — Lançamentos mensais (entries)

### Task 10: Entries — listar mês, upsert, toggle pago

**Files:**
- Create: `api/app/modules/entries/entries_controller.ts`, `entry_validator.ts`, `entry_service.ts`
- Modify: `start/routes.ts`
- Test: `tests/functional/entries.spec.ts`

**Interfaces:**
- Produces:
  - `GET /entries?year=&month=` → lista de itens ativos com seu entry do mês (ou `null`): `[{ item, entry }]`.
  - `POST /entries/upsert` body `{ itemId, year, month, amount, status?, note? }` → cria/atualiza por `unique(item_id,year,month)`.
  - `POST /entries/:id/toggle-paid` → alterna `status`, seta/limpa `paid_at`.
  - `PATCH /entries/:id` → edita amount/status/note.
- Service: `monthView(workspaceId, year, month)`, `upsert(workspaceId, dto)`, `togglePaid(workspaceId, id)`.

- [ ] **Step 1: Teste funcional**

```ts
test('upsert cria e idempotentemente atualiza o entry do mes', async ({ client, assert }) => {
  const { token } = await registerAndAuth(client, 'e1@test.com')
  const item = (await client.post('/items').bearerToken(token).json({ name: 'Luz', kind: 'expense' })).body()
  const a = await client.post('/entries/upsert').bearerToken(token).json({ itemId: item.id, year: 2026, month: 6, amount: 200 })
  a.assertStatus(200)
  const b = await client.post('/entries/upsert').bearerToken(token).json({ itemId: item.id, year: 2026, month: 6, amount: 264.6 })
  assert.equal(b.body().amount, '264.60')
  const t = await client.post(`/entries/${b.body().id}/toggle-paid`).bearerToken(token)
  assert.equal(t.body().status, 'paid')
  assert.exists(t.body().paidAt)
})
```

- [ ] **Step 2: Rodar → FAIL.**

- [ ] **Step 3: Service**

```ts
import MonthlyEntry from '#models/monthly_entry'
import Item from '#models/item'
import { DateTime } from 'luxon'

export default class EntryService {
  async upsert(workspaceId: number, dto: { itemId: number; year: number; month: number; amount: number; status?: 'paid'|'pending'; note?: string }) {
    const item = await Item.query().where('workspace_id', workspaceId).where('id', dto.itemId).firstOrFail()
    const entry = await MonthlyEntry.updateOrCreate(
      { itemId: item.id, year: dto.year, month: dto.month },
      { workspaceId, amount: dto.amount, status: dto.status ?? 'pending', note: dto.note ?? null,
        paidAt: dto.status === 'paid' ? DateTime.now() : null }
    )
    return entry
  }

  async togglePaid(workspaceId: number, id: number) {
    const entry = await MonthlyEntry.query().where('workspace_id', workspaceId).where('id', id).firstOrFail()
    entry.status = entry.status === 'paid' ? 'pending' : 'paid'
    entry.paidAt = entry.status === 'paid' ? DateTime.now() : null
    await entry.save()
    return entry
  }

  async monthView(workspaceId: number, year: number, month: number) {
    const items = await Item.query().where('workspace_id', workspaceId).where('is_active', true).orderBy('sort_order')
    const entries = await MonthlyEntry.query().where('workspace_id', workspaceId).where('year', year).where('month', month)
    const byItem = new Map(entries.map((e) => [e.itemId, e]))
    return items.map((item) => ({ item, entry: byItem.get(item.id) ?? null }))
  }
}
```

- [ ] **Step 4: Validator + Controller + Rotas.** Rodar testes → PASS. **Commit** `feat(api): lancamentos mensais (upsert, toggle pago, month view)`.

---

# FASE 5 — Dashboard

### Task 11: Dashboard — resumo do mês e anual

**Files:**
- Create: `api/app/modules/dashboard/dashboard_controller.ts`, `dashboard_service.ts`
- Modify: `start/routes.ts`
- Test: `tests/functional/dashboard.spec.ts`

**Interfaces:**
- Produces:
  - `GET /dashboard?year=&month=` → `{ totalDoMes, jaPago, faltaPagar, percentualPago, receitas, saldo, assinaturasCartao, breakdownPorCategoria: [{categoryId, name, color, total}] }`.
  - `GET /dashboard/yearly?year=` → `{ months: [{ month, total, paid }] }` (12 itens).
- Regras: §5 do spec (card_subscription fora de `totalDoMes`).

- [ ] **Step 1: Teste funcional** — criar itens income e expense, lançar valores, marcar um pago, conferir agregações.

```ts
test('resumo do mes calcula total, pago e percentual', async ({ client, assert }) => {
  const { token } = await registerAndAuth(client, 'd1@test.com')
  const luz = (await client.post('/items').bearerToken(token).json({ name: 'Luz', kind: 'expense' })).body()
  const net = (await client.post('/items').bearerToken(token).json({ name: 'Internet', kind: 'expense' })).body()
  await client.post('/entries/upsert').bearerToken(token).json({ itemId: luz.id, year: 2026, month: 6, amount: 200, status: 'paid' })
  await client.post('/entries/upsert').bearerToken(token).json({ itemId: net.id, year: 2026, month: 6, amount: 100, status: 'pending' })
  const res = await client.get('/dashboard?year=2026&month=6').bearerToken(token)
  assert.equal(res.body().totalDoMes, 300)
  assert.equal(res.body().jaPago, 200)
  assert.equal(res.body().faltaPagar, 100)
  assert.closeTo(res.body().percentualPago, 0.6667, 0.001)
})
```

- [ ] **Step 2: Rodar → FAIL.**

- [ ] **Step 3: Service** com agregação via query builder

```ts
import db from '@adonisjs/lucid/services/db'

export default class DashboardService {
  async monthSummary(workspaceId: number, year: number, month: number) {
    const rows = await db.from('monthly_entries as e')
      .join('items as i', 'i.id', 'e.item_id')
      .where('e.workspace_id', workspaceId).where('e.year', year).where('e.month', month)
      .select('i.kind', 'e.status', 'i.category_id')
      .sum('e.amount as amount').groupBy('i.kind', 'e.status', 'i.category_id')

    let totalDoMes = 0, jaPago = 0, receitas = 0, assinaturasCartao = 0
    for (const r of rows) {
      const amt = Number(r.amount)
      if (r.kind === 'expense') { totalDoMes += amt; if (r.status === 'paid') jaPago += amt }
      else if (r.kind === 'income') receitas += amt
      else if (r.kind === 'card_subscription') assinaturasCartao += amt
    }
    const faltaPagar = totalDoMes - jaPago
    const percentualPago = totalDoMes > 0 ? jaPago / totalDoMes : 0
    const saldo = receitas - totalDoMes

    const breakdown = await db.from('monthly_entries as e')
      .join('items as i', 'i.id', 'e.item_id')
      .leftJoin('categories as c', 'c.id', 'i.category_id')
      .where('e.workspace_id', workspaceId).where('e.year', year).where('e.month', month).where('i.kind', 'expense')
      .select('c.id as categoryId', 'c.name', 'c.color').sum('e.amount as total')
      .groupBy('c.id', 'c.name', 'c.color')

    return { totalDoMes, jaPago, faltaPagar, percentualPago, receitas, saldo, assinaturasCartao,
      breakdownPorCategoria: breakdown.map((b) => ({ ...b, total: Number(b.total) })) }
  }

  async yearly(workspaceId: number, year: number) {
    const rows = await db.from('monthly_entries as e').join('items as i', 'i.id', 'e.item_id')
      .where('e.workspace_id', workspaceId).where('e.year', year).where('i.kind', 'expense')
      .select('e.month', 'e.status').sum('e.amount as amount').groupBy('e.month', 'e.status')
    const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, total: 0, paid: 0 }))
    for (const r of rows) {
      const m = months[r.month - 1]; const amt = Number(r.amount)
      m.total += amt; if (r.status === 'paid') m.paid += amt
    }
    return { months }
  }
}
```

- [ ] **Step 4: Controller + Rotas.** Rodar testes → PASS. **Commit** `feat(api): dashboard mensal e anual`.

---

# FASE 6 — Importação da planilha

### Task 12: Import — parser e preview

**Files:**
- Create: `api/app/modules/import/xlsx_parser.ts`, `import_service.ts`, `import_controller.ts`
- Modify: `start/routes.ts`, `package.json` (dep `xlsx`)
- Test: `tests/functional/import.spec.ts` (usa a planilha real em fixtures)

**Interfaces:**
- Produces:
  - `xlsx_parser.ts`: `parseWorkbook(buffer): ParsedSheet` → `{ years: { year: number; items: { name: string; kind: Kind; categoryHint?: string; entries: { month: number; amount: number; status: 'paid'|'pending' }[] }[] }[] }`.
  - `POST /import/preview` (multipart `file`) → resumo `{ years: [{ year, itemCount, entryCount }] }`.
  - `POST /import/commit` (multipart `file`) → grava idempotente (upsert item por nome+kind; upsert entry por item+ano+mês). Retorna contagens.

- [ ] **Step 1: Copiar a planilha** para `api/tests/fixtures/planilha.xlsx`.

- [ ] **Step 2: Instalar dep** `cd api && npm i xlsx`.

- [ ] **Step 3: Teste funcional**

```ts
test('preview lê anos e itens da planilha', async ({ client, assert }) => {
  const { token } = await registerAndAuth(client, 'imp@test.com')
  const res = await client.post('/import/preview').bearerToken(token).file('file', 'tests/fixtures/planilha.xlsx')
  res.assertStatus(200)
  assert.isAtLeast(res.body().years.length, 1)
  const y2026 = res.body().years.find((y) => y.year === 2026)
  assert.isAbove(y2026.itemCount, 0)
})
```

- [ ] **Step 4: Rodar → FAIL.**

- [ ] **Step 5: Parser** — regras de tolerância (spec §11): a aba "Página1" tem blocos por ano com cabeçalho `Item | Valores | Jan..Dez`; mapear meses por posição de coluna; **normalizar valores** (string como `"65 (guardado BB)"`, `"x"`, `"-"`, `" R$ 125,05 "` → número ou ignora). A aba "Controle 2026" fornece `status` (colunas P–AA = Jan–Dez) → casar por nome do item para `paid`/`pending` (default `pending`). Inferir `kind`: bloco de receitas/salários → `income`; "Fixos cartão de crédito" → `card_subscription`; demais → `expense`. `categoryHint` pelo nome (ex: "Internet"→Moradia, "Cartão"→Cartão).

```ts
function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return v
  if (typeof v !== 'string') return null
  const cleaned = v.replace(/r\$\s*/i, '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.\-]/g, '').trim()
  const n = Number.parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}
```

- [ ] **Step 6: ImportService.commit** — transação: para cada item, `Item.updateOrCreate({workspaceId, name, kind}, {...})`; para cada entry, `MonthlyEntry.updateOrCreate({itemId, year, month}, {amount, status})`. Mapear `categoryHint`→`categoryId` (cria categoria se não existir).

- [ ] **Step 7: Controller + Rotas.** Rodar testes → PASS. **Commit** `feat(api): importacao da planilha (preview + commit)`.

---

# FASE 7 — Fundação da Web (React + Vite)

### Task 13: Scaffold Web + Tailwind + tokens + shadcn

**Files:**
- Create: `web/` (Vite react-ts), `web/tailwind.config.ts`, `web/src/styles/tokens.css`, `web/src/index.css`
- Create: `web/.env` (`VITE_API_URL=http://localhost:3333`)

**Interfaces:**
- Produces: app Vite rodando em `:5173`; Tailwind com tokens da paleta; shadcn/ui inicializado.

- [ ] **Step 1: Gerar** (na raiz): `npm create vite@latest web -- --template react-ts && cd web && npm i`.

- [ ] **Step 2: Tailwind** `npm i -D tailwindcss postcss autoprefixer && npx tailwindcss init -p`. Configurar `content`.

- [ ] **Step 3: Tokens** (`src/styles/tokens.css`) com as CSS variables da spec §7 (`--bg`, `--surface`, `--primary` `#4CAF82`, `--accent` `#F5C84C`, etc.) e mapear no `tailwind.config.ts` (`colors: { primary: 'var(--primary)', accent: 'var(--accent)', ... }`). Definir fonte Inter.

- [ ] **Step 4: shadcn/ui** `npx shadcn@latest init` (estilo, base color neutra, CSS vars on); adicionar componentes base: `button card input label badge dialog dropdown-menu select table toast skeleton progress`.

- [ ] **Step 5: Smoke** `npm run dev` → página inicial com cor de fundo `--bg`. **Commit** `feat(web): scaffold vite+tailwind+shadcn com tokens da paleta`.

### Task 14: Camada de API + React Query + formatação BRL

**Files:**
- Create: `web/src/lib/api.ts`, `web/src/lib/query.ts`, `web/src/lib/format.ts`
- Test: `web/src/lib/format.test.ts` (Vitest)

**Interfaces:**
- Produces: `api` (axios instance com interceptor que injeta `Authorization: Bearer` do storage e trata 401), `queryClient`, `formatBRL(n)`, `MONTHS_PT` (labels), `parseMonthParam`.

- [ ] **Step 1: Instalar** `npm i axios @tanstack/react-query react-router-dom react-hook-form zod @hookform/resolvers recharts lucide-react && npm i -D vitest @testing-library/react @testing-library/jest-dom jsdom`.

- [ ] **Step 2: Teste Vitest** (`format.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import { formatBRL } from './format'
describe('formatBRL', () => {
  it('formata em reais', () => { expect(formatBRL(1234.5)).toBe('R$ 1.234,50') })
  it('trata zero', () => { expect(formatBRL(0)).toBe('R$ 0,00') })
})
```

- [ ] **Step 3: Implementar** `format.ts` (`Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' })`), `api.ts` (axios baseURL `import.meta.env.VITE_API_URL`, interceptor de request com token de `localStorage`, interceptor de response que em 401 limpa sessão e redireciona p/ login), `query.ts` (`new QueryClient`). Configurar `vitest.config.ts` (jsdom).

- [ ] **Step 4: Rodar** `npm run test` → PASS. **Commit** `feat(web): cliente api, react-query e formatacao BRL`.

### Task 15: Sessão, rotas e layout (shell autenticado)

**Files:**
- Create: `web/src/features/auth/session.ts` (store), `web/src/app/router.tsx`, `web/src/app/AppLayout.tsx`, `web/src/app/ProtectedRoute.tsx`, `web/src/main.tsx` (providers)

**Interfaces:**
- Consumes: `api`, `queryClient`.
- Produces: `useSession()` (`{ user, workspace, token, login(data), logout() }`, persiste em localStorage); `router` com rotas públicas (`/login`, `/register`) e protegidas (`/`, `/lancamentos`, `/itens`, `/categorias`, `/assinaturas`, `/historico`, `/importar`); `AppLayout` com sidebar (nav + logo Lefinance) e topbar.

- [ ] **Step 1: `session.ts`** — store leve (zustand ou context) com `token/user/workspace` em localStorage; `login()` salva, `logout()` limpa e chama `/auth/logout`.

- [ ] **Step 2: `ProtectedRoute`** — sem token → `<Navigate to="/login">`.

- [ ] **Step 3: `AppLayout`** — sidebar com itens de navegação (Dashboard, Lançamentos, Itens, Categorias, Assinaturas, Histórico, Importar) usando `lucide-react`, paleta verde; topbar com nome do usuário e logout.

- [ ] **Step 4: `router.tsx` + `main.tsx`** — `QueryClientProvider`, `RouterProvider`, `Toaster`.

- [ ] **Step 5: Rodar** `npm run dev`, verificar redirecionamento p/ `/login`. **Commit** `feat(web): sessao, rotas protegidas e layout`.

---

# FASE 8 — Telas

### Task 16: Auth UI (login + cadastro)

**Files:**
- Create: `web/src/features/auth/LoginPage.tsx`, `RegisterPage.tsx`, `useAuthMutations.ts`

**Interfaces:**
- Consumes: `api`, `useSession`.
- Produces: telas com React Hook Form + Zod; sucesso → salva sessão e navega p/ `/`.

- [ ] **Step 1: Schemas Zod** (login: email+senha; register: nome+email+senha+confirmar).
- [ ] **Step 2: Mutations** (`useLogin`, `useRegister`) chamando `/auth/login` e `/auth/register`; on success `session.login()`.
- [ ] **Step 3: UI** — layout split com gradiente verde→branco, card branco, inputs shadcn, mensagens de erro (incl. 422 da API), toast.
- [ ] **Step 4: Verificar** fluxo registrar → cair no dashboard. **Commit** `feat(web): telas de login e cadastro`.

### Task 17: Dashboard UI

**Files:**
- Create: `web/src/features/dashboard/DashboardPage.tsx`, `useDashboard.ts`, `SummaryCards.tsx`, `MonthYearPicker.tsx`, `CategoryBreakdownChart.tsx`, `YearlyEvolutionChart.tsx`

**Interfaces:**
- Consumes: `GET /dashboard`, `GET /dashboard/yearly`.
- Produces: cards (Total do mês, Já pago, Falta pagar, anel % pago via `Progress`/Recharts RadialBar), gráfico de evolução (LineChart) e breakdown (PieChart), seletor ano/mês.

- [ ] **Step 1: Hook** `useDashboard(year, month)` (React Query) e `useYearly(year)`.
- [ ] **Step 2: `SummaryCards`** — 4 cards; % pago como anel; cores: pago=verde, falta=amarelo; valores via `formatBRL`.
- [ ] **Step 3: Charts** com Recharts (cores da paleta).
- [ ] **Step 4: `MonthYearPicker`** controla estado e refetch.
- [ ] **Step 5: Verificar** com dados reais (criar via API/import). **Commit** `feat(web): dashboard com cards e graficos`.

### Task 18: Tela de Lançamentos do mês (grid Pago/Pendente)

**Files:**
- Create: `web/src/features/entries/EntriesPage.tsx`, `useEntries.ts`, `EntryRow.tsx`, `EditableAmount.tsx`, `StatusToggle.tsx`

**Interfaces:**
- Consumes: `GET /entries`, `POST /entries/upsert`, `POST /entries/:id/toggle-paid`.
- Produces: tabela de itens do mês; editar valor inline (debounced upsert); toggle Pago/Pendente (verde/amarelo) com optimistic update; rodapé com total/pago/falta.

- [ ] **Step 1: Hook** `useEntries(year, month)` + mutations `useUpsertEntry`, `useTogglePaid` com `onMutate` optimistic e invalidação do dashboard.
- [ ] **Step 2: `EditableAmount`** — input numérico que dá upsert ao confirmar (blur/Enter), debounce.
- [ ] **Step 3: `StatusToggle`** — badge clicável (verde=Pago, amarelo=Pendente).
- [ ] **Step 4: `EntriesPage`** — `MonthYearPicker` + tabela agrupada por categoria; rodapé com somas.
- [ ] **Step 5: Verificar** toggling reflete no dashboard. **Commit** `feat(web): grid de lancamentos do mes`.

### Task 19: Itens & Categorias (CRUD UI)

**Files:**
- Create: `web/src/features/items/ItemsPage.tsx`, `ItemFormDialog.tsx`, `useItems.ts`; `web/src/features/categories/CategoriesPage.tsx`, `CategoryFormDialog.tsx`, `useCategories.ts`

**Interfaces:**
- Consumes: `/items`, `/categories` (CRUD).
- Produces: listagem + diálogos de criar/editar; seleção de categoria (com cor/ícone); filtro por `kind`.

- [ ] **Step 1: Hooks** de CRUD (React Query) p/ items e categories.
- [ ] **Step 2: `CategoriesPage` + dialog** — nome, cor (color picker simples), ícone (select de lucide).
- [ ] **Step 3: `ItemsPage` + dialog** — nome, kind, categoria, valor base; tabs por kind (Receitas/Despesas/Cartão).
- [ ] **Step 4: Verificar** CRUD. **Commit** `feat(web): telas de itens e categorias`.

### Task 20: Assinaturas de cartão

**Files:**
- Create: `web/src/features/subscriptions/SubscriptionsPage.tsx`, `useSubscriptions.ts`

**Interfaces:**
- Consumes: `/items?kind=card_subscription`.
- Produces: lista dedicada com soma total mensal (informativa), criar/editar/remover.

- [ ] **Step 1: Página** reutilizando hooks de items filtrando `kind=card_subscription`; card com soma total.
- [ ] **Step 2: Verificar. Commit** `feat(web): assinaturas de cartao`.

### Task 21: Histórico multi-ano

**Files:**
- Create: `web/src/features/history/HistoryPage.tsx`, `useHistory.ts`, `YearCompareChart.tsx`

**Interfaces:**
- Consumes: `GET /dashboard/yearly?year=` (múltiplos anos).
- Produces: gráfico comparando total por mês entre anos selecionados; seletor de anos.

- [ ] **Step 1: Hook** que busca yearly de N anos (`useQueries`).
- [ ] **Step 2: `YearCompareChart`** (LineChart multi-série) + seletor de anos.
- [ ] **Step 3: Verificar. Commit** `feat(web): historico comparativo multi-ano`.

### Task 22: Importar planilha (UI)

**Files:**
- Create: `web/src/features/import/ImportPage.tsx`, `useImport.ts`

**Interfaces:**
- Consumes: `POST /import/preview`, `POST /import/commit` (multipart).
- Produces: upload do `.xlsx`, exibe preview (anos, itens, lançamentos), botão confirmar → commit → toast + invalida queries.

- [ ] **Step 1: Hooks** `usePreview`/`useCommit` (FormData).
- [ ] **Step 2: UI** — dropzone, tabela de preview, confirmação.
- [ ] **Step 3: Verificar** import end-to-end com a planilha real. **Commit** `feat(web): tela de importacao da planilha`.

---

# FASE 9 — PWA & Acabamento

### Task 23: PWA-ready

**Files:**
- Modify: `web/vite.config.ts`, `web/index.html`
- Create: `web/public/icons/*`, manifest via plugin

**Interfaces:**
- Produces: `vite-plugin-pwa` com manifest (nome "Lefinance", `theme_color` `#4CAF82`, `background_color` `#FBFDFB`, ícones 192/512) e SW `registerType: 'autoUpdate'`.

- [ ] **Step 1: Instalar** `npm i -D vite-plugin-pwa` e configurar no `vite.config.ts`.
- [ ] **Step 2: Ícones** (placeholder com logo Lefinance).
- [ ] **Step 3: Build** `npm run build && npm run preview` → manifest válido, SW registrado (sem ativar cache agressivo agora). **Commit** `feat(web): estrutura PWA (manifest + service worker)`.

### Task 24: Polish & verificação final

**Files:**
- Modify: vários (estados de loading/empty/erro, responsividade)
- Create: `README.md` (atualizar com setup completo)

**Interfaces:**
- Produces: estados de carregamento (skeletons), vazios e erro consistentes; responsivo; README com passo-a-passo (XAMPP, schema, `.env`, rodar API e Web, importar planilha).

- [ ] **Step 1: Skeletons/empty/error** nas telas principais.
- [ ] **Step 2: Responsividade** (sidebar colapsável no mobile).
- [ ] **Step 3: Revisão da paleta** (Pago=verde, Pendente=amarelo em todo o app).
- [ ] **Step 4: Atualizar README** e checar **critérios de aceite** da spec §10.
- [ ] **Step 5: Commit** `chore: polish, estados e documentacao final`.

---

## Self-Review (cobertura da spec)

- Auth aberto (email+senha) → Tasks 6, 16. ✔
- Workspace por usuário (+ members) → Tasks 3, 5, 7. ✔
- Categorias customizáveis → Tasks 8, 19. ✔
- Itens (income/expense/card_subscription) → Tasks 9, 19, 20. ✔
- Lançamentos mensais + status Pago/Pendente → Tasks 10, 18. ✔
- Dashboard (total/pago/falta/% + gráficos) → Tasks 11, 17. ✔
- Histórico multi-ano → Tasks 11 (yearly), 21. ✔
- Assinaturas de cartão → Tasks 9/20 (kind=card_subscription, fora do total). ✔
- Importar planilha → Tasks 12, 22. ✔
- Visual paleta branco/verde/amarelo → Tasks 13, 16-22, 24. ✔
- PWA-ready → Task 23. ✔
- Arquitetura em camadas + escopo por workspace → Tasks 2,5,7,8-11. ✔

**Dependências/ordem:** Fases 0→2 são sequenciais (fundação). Dentro da Fase 3-6, módulos da API podem ser paralelizados após a Fase 2. Fase 7 (web foundation) depende de nada da API para começar, mas as telas (Fase 8) consomem os endpoints das Fases 3-6.
