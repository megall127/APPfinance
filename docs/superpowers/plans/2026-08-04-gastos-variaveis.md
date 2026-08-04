# Gastos Variáveis — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma aba "Gastos" onde o usuário anota cada gasto avulso do mês; o total vira uma linha somente-leitura em Lançamentos, e por consequência entra no Dashboard e no Histórico.

**Architecture:** Tabela `variable_expenses` guarda os gastos. Um `EntrySyncService` projeta `SUM(amount)` do mês num `monthly_entry` de um item marcado com `items.auto_source = 'variable_expenses'`. Esse lançamento é somente-leitura em toda a API (422), e a UI reflete a trava com um cadeado.

**Tech Stack:** AdonisJS + Lucid + MySQL + VineJS + Japa (api) · React 19 + TanStack Query v5 + Tailwind 4 + Vitest + RTL (web)

**Spec:** `docs/superpowers/specs/2026-08-04-gastos-variaveis-design.md`

## Global Constraints

- **Não existe banco MySQL acessível nesta máquina.** A porta 3306 do EasyPanel não é exposta publicamente e não há MySQL local. Decisão do usuário: aplicar o DDL em produção via phpMyAdmin, com o script da Task 6.
- **Consequência 1:** `api/database/schema.ts` — que traz o cabeçalho "DO NOT EDIT manually" — **será editado à mão** nesta implementação, replicando exatamente o que `node ace migration:run` geraria. Isso é um desvio consciente, registrado aqui e no relatório final.
- **Consequência 2:** os testes Japa (`api/tests/**`) são **escritos mas não executados**. A verificação possível na API é `npm run typecheck` e `npm run lint`. Nenhum passo deste plano pode afirmar que um teste da API passou.
- **Os testes do web executam normalmente** (`npm test` em `web/`, Vitest não precisa de banco). Toda task de web termina com a suíte verde de verdade.
- Idioma de toda string visível ao usuário: **pt-BR**. Moeda: **BRL**.
- Regra de dinheiro no JSON: coluna `decimal` → **string**; agregado em JS → **número**.
- Datas trafegam como `'YYYY-MM-DD'`. Nunca `toISOString()` no cliente — em fuso negativo ele devolve o dia anterior depois das 21h.
- Nenhum commit é feito sem o usuário pedir. Os passos "Commit" ficam marcados como opcionais e agrupados no fim.

---

## Estrutura de arquivos

**API — criar**

| Arquivo | Responsabilidade |
|---|---|
| `api/database/migrations/1782900000001_add_auto_source_to_items.ts` | coluna `auto_source` + índice único |
| `api/database/migrations/1782900000002_create_variable_expenses_table.ts` | tabela dos gastos |
| `api/app/models/variable_expense.ts` | model Lucid + relações |
| `api/app/exceptions/auto_item_read_only_exception.ts` | 422 tipada |
| `api/app/modules/variable_expenses/month_range.ts` | funções puras (`monthRange`, `toAmountString`) |
| `api/app/modules/variable_expenses/entry_sync_service.ts` | **único escritor** da linha automática |
| `api/app/modules/variable_expenses/variable_expense_service.ts` | CRUD escopado + resumo do mês |
| `api/app/modules/variable_expenses/variable_expense_validator.ts` | VineJS |
| `api/app/modules/variable_expenses/variable_expenses_controller.ts` | HTTP |
| `api/tests/unit/variable_expense_helpers.spec.ts` | `monthRange` / `toAmountString` |
| `api/tests/unit/entry_sync_service.spec.ts` | sincronia (precisa de banco) |
| `api/tests/functional/variable_expenses.spec.ts` | CRUD + travas (precisa de banco) |
| `docs/sql/2026-08-04-gastos-variaveis.sql` | script para o phpMyAdmin |

**API — modificar**

| Arquivo | Mudança |
|---|---|
| `api/database/schema.ts` | +`VariableExpenseSchema`, +`ItemSchema.autoSource` (à mão) |
| `api/start/routes.ts` | grupo `variable-expenses` |
| `api/app/modules/entries/entry_service.ts` | trava 422 em `upsert`, `update`, `togglePaid` |
| `api/app/modules/items/item_service.ts` | trava 422 em `update` (kind) e `deactivateOrDelete` |

**Web — criar** (tudo em `web/src/features/gastos/`)

| Arquivo | Responsabilidade |
|---|---|
| `grouping.ts` + `grouping.test.ts` | agrupar por dia, rótulo do dia, soma em centavos |
| `useVariableExpenses.ts` | queries + mutations + invalidações |
| `ExpenseFormDialog.tsx` + `.test.tsx` | criar/editar/excluir |
| `ExpenseRow.tsx` | uma linha |
| `DayGroup.tsx` | cabeçalho do dia + linhas |
| `CategorySummary.tsx` | chips por categoria |
| `GastosPage.tsx` + `.test.tsx` | página |

**Web — modificar**

| Arquivo | Mudança |
|---|---|
| `web/src/app/router.tsx` | rota `/gastos` |
| `web/src/app/AppLayout.tsx` | item de nav "Gastos" |
| `web/src/features/lancamentos/useEntries.ts` | `EntryItem.autoSource` |
| `web/src/features/lancamentos/EntryRow.tsx` | cadeado + link |

---

## Task 1: Migrations, schema.ts e model

**Files:**
- Create: `api/database/migrations/1782900000001_add_auto_source_to_items.ts`
- Create: `api/database/migrations/1782900000002_create_variable_expenses_table.ts`
- Create: `api/app/models/variable_expense.ts`
- Modify: `api/database/schema.ts`
- Modify: `api/tests/unit/models.spec.ts`

**Interfaces:**
- Produces: `VariableExpense` (model, default export de `#models/variable_expense`) com colunas `id`, `workspaceId`, `categoryId`, `spentOn: DateTime`, `amount: string`, `description: string | null`; `ItemSchema.autoSource: string | null`.

- [ ] **Step 1: Migration da coluna `auto_source`**

`api/database/migrations/1782900000001_add_auto_source_to_items.ts`:

```ts
import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'items'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Marca o item gerado por uma feature automatica. NULL = item normal do usuario.
      // Hoje so existe um valor possivel: 'variable_expenses'.
      table.string('auto_source', 32).nullable()

      // Um item automatico por fonte, por workspace. O InnoDB permite varios NULLs
      // num indice unico, entao os itens do usuario nao sao afetados — mesmo truque
      // de reserve_movements.yield_period.
      table.unique(['workspace_id', 'auto_source'], {
        indexName: 'items_workspace_auto_source_unique',
      })
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropUnique(['workspace_id', 'auto_source'], 'items_workspace_auto_source_unique')
      table.dropColumn('auto_source')
    })
  }
}
```

- [ ] **Step 2: Migration da tabela `variable_expenses`**

`api/database/migrations/1782900000002_create_variable_expenses_table.ts`:

```ts
import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'variable_expenses'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id')
      table
        .bigInteger('workspace_id')
        .unsigned()
        .references('id')
        .inTable('workspaces')
        .onDelete('CASCADE')
      table
        .bigInteger('category_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('categories')
        .onDelete('SET NULL')

      // Data-caixa do gasto. E ela — e so ela — que define o mes de competencia.
      table.date('spent_on').notNullable()
      table.decimal('amount', 12, 2).notNullable().defaultTo(0)
      table.string('description', 180).nullable()

      // Consulta quente: "todos os gastos do mes X deste workspace".
      table.index(['workspace_id', 'spent_on'], 'variable_expenses_ws_spent_on_index')
      // Resumo por categoria dentro do mes.
      table.index(['workspace_id', 'category_id'], 'variable_expenses_ws_category_index')

      table.timestamp('created_at').nullable()
      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
```

- [ ] **Step 3: Editar `api/database/schema.ts` à mão**

Adicionar `autoSource` em `ItemSchema` — na lista `$columns` (em ordem alfabética, entre `amount`-less `'id'` e `'installmentsPaid'`… ou seja, logo após `'id'`) e como `@column()`:

```ts
export class ItemSchema extends BaseModel {
  static $columns = ['autoSource', 'categoryId', 'createdAt', 'defaultAmount', 'id', 'installmentsPaid', 'installmentsTotal', 'isActive', 'kind', 'name', 'sortOrder', 'updatedAt', 'workspaceId'] as const
  $columns = ItemSchema.$columns
  @column()
  declare autoSource: string | null
  @column()
  declare categoryId: bigint | number | null
  // ... resto inalterado
```

E acrescentar a classe nova ao final do arquivo, seguindo exatamente o formato das demais (colunas em ordem alfabética):

```ts
export class VariableExpenseSchema extends BaseModel {
  static $columns = ['amount', 'categoryId', 'createdAt', 'description', 'id', 'spentOn', 'updatedAt', 'workspaceId'] as const
  $columns = VariableExpenseSchema.$columns
  @column()
  declare amount: string
  @column()
  declare categoryId: bigint | number | null
  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime | null
  @column()
  declare description: string | null
  @column({ isPrimary: true })
  declare id: bigint | number
  @column.date()
  declare spentOn: DateTime
  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null
  @column()
  declare workspaceId: bigint | number | null
}
```

Referência de formato: `ReserveMovementSchema` no mesmo arquivo usa `@column.date()` para `occurredOn` e `decimal` → `string` para `amount`. Seguir igual.

- [ ] **Step 4: Model**

`api/app/models/variable_expense.ts`:

```ts
import { VariableExpenseSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Workspace from '#models/workspace'
import Category from '#models/category'

export default class VariableExpense extends VariableExpenseSchema {
  @belongsTo(() => Workspace)
  declare workspace: BelongsTo<typeof Workspace>

  @belongsTo(() => Category)
  declare category: BelongsTo<typeof Category>
}
```

- [ ] **Step 5: Teste de model**

Acrescentar ao final de `api/tests/unit/models.spec.ts`, dentro do grupo existente `'Models – relations wired'` (importar `VariableExpense` no topo do arquivo):

```ts
  test('VariableExpense: instantiate and set properties', ({ assert }) => {
    const e = new VariableExpense()
    e.amount = '32.50'
    e.description = 'Almoço'
    assert.equal(e.amount, '32.50')
    assert.equal(e.description, 'Almoço')
  })

  test('VariableExpense has workspace and category relations', ({ assert }) => {
    assert.isDefined(VariableExpense.$getRelation('workspace'))
    assert.isDefined(VariableExpense.$getRelation('category'))
  })

  test('Item exposes autoSource column', ({ assert }) => {
    const i = new Item()
    i.autoSource = 'variable_expenses'
    assert.equal(i.autoSource, 'variable_expenses')
  })
```

- [ ] **Step 6: Verificar**

Run: `cd api && npm run typecheck`
Expected: PASS, sem erro. É a única verificação disponível — o teste acima **não será executado** (falta banco).

---

## Task 2: Helpers puros (`month_range.ts`)

**Files:**
- Create: `api/app/modules/variable_expenses/month_range.ts`
- Test: `api/tests/unit/variable_expense_helpers.spec.ts`

**Interfaces:**
- Produces: `monthRange(year: number, month: number): [string, string]` · `toAmountString(value: unknown): string` · `isZeroAmount(amount: string): boolean`

- [ ] **Step 1: Escrever o teste primeiro**

`api/tests/unit/variable_expense_helpers.spec.ts`:

```ts
import { test } from '@japa/runner'
import {
  isZeroAmount,
  monthRange,
  toAmountString,
} from '#modules/variable_expenses/month_range'

test.group('monthRange', () => {
  test('devolve o primeiro e o ultimo dia do mes', ({ assert }) => {
    assert.deepEqual(monthRange(2026, 8), ['2026-08-01', '2026-08-31'])
  })

  test('fevereiro comum termina em 28', ({ assert }) => {
    assert.deepEqual(monthRange(2026, 2), ['2026-02-01', '2026-02-28'])
  })

  test('fevereiro bissexto termina em 29', ({ assert }) => {
    assert.deepEqual(monthRange(2024, 2), ['2024-02-01', '2024-02-29'])
  })

  test('dezembro nao vaza para o ano seguinte', ({ assert }) => {
    assert.deepEqual(monthRange(2026, 12), ['2026-12-01', '2026-12-31'])
  })
})

test.group('toAmountString', () => {
  test('passa a string do SUM adiante sem tocar', ({ assert }) => {
    // O mysql2 devolve DECIMAL como string; ela ja esta no formato exato da coluna.
    assert.equal(toAmountString('487.60'), '487.60')
  })

  test('null vira zero', ({ assert }) => {
    assert.equal(toAmountString(null), '0.00')
    assert.equal(toAmountString(undefined), '0.00')
  })

  test('numero vira string com duas casas', ({ assert }) => {
    assert.equal(toAmountString(487.6), '487.60')
  })

  test('lixo vira zero em vez de NaN', ({ assert }) => {
    assert.equal(toAmountString('abc'), '0.00')
    assert.equal(toAmountString({}), '0.00')
  })
})

test.group('isZeroAmount', () => {
  test('reconhece as varias grafias de zero', ({ assert }) => {
    assert.isTrue(isZeroAmount('0.00'))
    assert.isTrue(isZeroAmount('0'))
    assert.isTrue(isZeroAmount('0.000'))
    assert.isFalse(isZeroAmount('0.01'))
    assert.isFalse(isZeroAmount('487.60'))
  })
})
```

- [ ] **Step 2: Implementar**

`api/app/modules/variable_expenses/month_range.ts`:

```ts
import { DateTime } from 'luxon'

/**
 * Primeiro e ultimo dia do mes, em 'YYYY-MM-DD', para usar num BETWEEN de coluna DATE.
 * Luxon resolve bissexto e virada de ano sozinho — nao existe aritmetica de dias aqui.
 */
export function monthRange(year: number, month: number): [string, string] {
  const start = DateTime.fromObject({ year, month, day: 1 })
  return [start.toISODate()!, start.endOf('month').toISODate()!]
}

/**
 * Normaliza o retorno de um SUM(decimal) para o formato que a coluna
 * monthly_entries.amount espera.
 *
 * O mysql2 devolve DECIMAL como STRING ('487.60'), que ja e o valor exato — ela
 * passa adiante intacta, sem virar float no caminho. Numero e null existem so
 * como defesa contra driver configurado diferente e contra mes vazio.
 */
export function toAmountString(value: unknown): string {
  if (value === null || value === undefined) return '0.00'
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value)) return value
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return '0.00'
  return parsed.toFixed(2)
}

/** True quando o total do mes e zero, em qualquer grafia ('0', '0.00', '0.000'). */
export function isZeroAmount(amount: string): boolean {
  return Number(amount) === 0
}
```

- [ ] **Step 3: Verificar**

Run: `cd api && npm run typecheck`
Expected: PASS. O teste acima **não será executado** (a suíte inteira exige conexão com o banco no boot do Adonis).

---

## Task 3: `EntrySyncService`

**Files:**
- Create: `api/app/modules/variable_expenses/entry_sync_service.ts`
- Test: `api/tests/unit/entry_sync_service.spec.ts`

**Interfaces:**
- Consumes: `monthRange`, `toAmountString`, `isZeroAmount` (Task 2); `VariableExpense` (Task 1)
- Produces: `EntrySyncService` (default export) com `syncMonth(workspaceId, year, month): Promise<void>` e `syncForDates(workspaceId, dates: Array<DateTime | string>): Promise<void>`; constantes exportadas `AUTO_SOURCE = 'variable_expenses'` e `AUTO_ITEM_NAME = 'Gastos do mês'`

- [ ] **Step 1: Escrever o teste primeiro**

`api/tests/unit/entry_sync_service.spec.ts`:

```ts
import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import User from '#models/user'
import Item from '#models/item'
import MonthlyEntry from '#models/monthly_entry'
import VariableExpense from '#models/variable_expense'
import WorkspaceService from '#modules/workspaces/workspace_service'
import EntrySyncService, { AUTO_SOURCE } from '#modules/variable_expenses/entry_sync_service'

async function makeWorkspace(email: string) {
  const user = await User.create({ fullName: 'Sync Tester', email, password: 'secret123' })
  const workspace = await new WorkspaceService().provisionForUser(user)
  return Number(workspace.id)
}

async function addExpense(workspaceId: number, spentOn: string, amount: string) {
  return VariableExpense.create({
    workspaceId,
    categoryId: null,
    spentOn: DateTime.fromISO(spentOn),
    amount,
    description: null,
  })
}

function findAutoItem(workspaceId: number) {
  return Item.query().where('workspace_id', workspaceId).where('auto_source', AUTO_SOURCE).first()
}

function findEntry(workspaceId: number, itemId: number, year: number, month: number) {
  return MonthlyEntry.query()
    .where('workspace_id', workspaceId)
    .where('item_id', itemId)
    .where('year', year)
    .where('month', month)
    .first()
}

test.group('EntrySyncService.syncMonth', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('cria o item automatico e o lancamento na primeira sincronia', async ({ assert }) => {
    const ws = await makeWorkspace('sync1@example.com')
    await addExpense(ws, '2026-08-04', '32.50')

    await new EntrySyncService().syncMonth(ws, 2026, 8)

    const item = await findAutoItem(ws)
    assert.isNotNull(item)
    assert.equal(item!.name, 'Gastos do mês')
    assert.equal(item!.kind, 'expense')
    assert.isTrue(Boolean(item!.isActive))

    const entry = await findEntry(ws, Number(item!.id), 2026, 8)
    assert.isNotNull(entry)
    assert.equal(Number(entry!.amount), 32.5)
    assert.equal(entry!.status, 'paid')
    assert.isNotNull(entry!.paidAt)
  })

  test('soma varios gastos do mesmo mes', async ({ assert }) => {
    const ws = await makeWorkspace('sync2@example.com')
    await addExpense(ws, '2026-08-04', '32.50')
    await addExpense(ws, '2026-08-04', '18.90')
    await addExpense(ws, '2026-08-03', '84.10')

    await new EntrySyncService().syncMonth(ws, 2026, 8)

    const item = await findAutoItem(ws)
    const entry = await findEntry(ws, Number(item!.id), 2026, 8)
    assert.equal(Number(entry!.amount), 135.5)
  })

  test('ignora gastos de outro mes', async ({ assert }) => {
    const ws = await makeWorkspace('sync3@example.com')
    await addExpense(ws, '2026-07-31', '100.00')
    await addExpense(ws, '2026-08-01', '25.00')

    await new EntrySyncService().syncMonth(ws, 2026, 8)

    const item = await findAutoItem(ws)
    const entry = await findEntry(ws, Number(item!.id), 2026, 8)
    assert.equal(Number(entry!.amount), 25)
  })

  test('mes sem gastos e sem item automatico nao cria nada', async ({ assert }) => {
    const ws = await makeWorkspace('sync4@example.com')

    await new EntrySyncService().syncMonth(ws, 2026, 8)

    assert.isNull(await findAutoItem(ws))
  })

  test('apagar o ultimo gasto REMOVE o lancamento, nao zera', async ({ assert }) => {
    const ws = await makeWorkspace('sync5@example.com')
    const expense = await addExpense(ws, '2026-08-04', '32.50')
    const service = new EntrySyncService()
    await service.syncMonth(ws, 2026, 8)

    const item = await findAutoItem(ws)
    assert.isNotNull(await findEntry(ws, Number(item!.id), 2026, 8))

    await expense.delete()
    await service.syncMonth(ws, 2026, 8)

    assert.isNull(await findEntry(ws, Number(item!.id), 2026, 8))
  })

  test('e idempotente: rodar duas vezes nao duplica nem muda o valor', async ({ assert }) => {
    const ws = await makeWorkspace('sync6@example.com')
    await addExpense(ws, '2026-08-04', '32.50')
    const service = new EntrySyncService()

    await service.syncMonth(ws, 2026, 8)
    await service.syncMonth(ws, 2026, 8)

    const item = await findAutoItem(ws)
    const entries = await MonthlyEntry.query()
      .where('workspace_id', ws)
      .where('item_id', Number(item!.id))
    assert.lengthOf(entries, 1)
    assert.equal(Number(entries[0].amount), 32.5)
  })

  test('reativa o item automatico que foi desativado', async ({ assert }) => {
    const ws = await makeWorkspace('sync7@example.com')
    await addExpense(ws, '2026-08-04', '32.50')
    const service = new EntrySyncService()
    await service.syncMonth(ws, 2026, 8)

    const item = await findAutoItem(ws)
    item!.isActive = false
    await item!.save()

    await addExpense(ws, '2026-08-05', '10.00')
    await service.syncMonth(ws, 2026, 8)

    const reloaded = await findAutoItem(ws)
    assert.isTrue(Boolean(reloaded!.isActive))
  })

  test('preserva o paidAt original entre sincronias', async ({ assert }) => {
    const ws = await makeWorkspace('sync8@example.com')
    await addExpense(ws, '2026-08-04', '32.50')
    const service = new EntrySyncService()
    await service.syncMonth(ws, 2026, 8)

    const item = await findAutoItem(ws)
    const first = await findEntry(ws, Number(item!.id), 2026, 8)
    const originalPaidAt = first!.paidAt!.toMillis()

    await addExpense(ws, '2026-08-05', '10.00')
    await service.syncMonth(ws, 2026, 8)

    const second = await findEntry(ws, Number(item!.id), 2026, 8)
    assert.equal(second!.paidAt!.toMillis(), originalPaidAt)
  })

  test('nao mistura workspaces', async ({ assert }) => {
    const wsA = await makeWorkspace('sync9a@example.com')
    const wsB = await makeWorkspace('sync9b@example.com')
    await addExpense(wsA, '2026-08-04', '32.50')
    await addExpense(wsB, '2026-08-04', '999.00')

    await new EntrySyncService().syncMonth(wsA, 2026, 8)

    const itemA = await findAutoItem(wsA)
    const entryA = await findEntry(wsA, Number(itemA!.id), 2026, 8)
    assert.equal(Number(entryA!.amount), 32.5)
    assert.isNull(await findAutoItem(wsB))
  })
})

test.group('EntrySyncService.syncForDates', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('sincroniza os dois meses quando o gasto atravessa a virada', async ({ assert }) => {
    const ws = await makeWorkspace('sync10@example.com')
    const expense = await addExpense(ws, '2026-07-31', '100.00')
    const service = new EntrySyncService()
    await service.syncMonth(ws, 2026, 7)

    const item = await findAutoItem(ws)
    assert.equal(Number((await findEntry(ws, Number(item!.id), 2026, 7))!.amount), 100)

    // move de 31/07 para 01/08
    expense.spentOn = DateTime.fromISO('2026-08-01')
    await expense.save()
    await service.syncForDates(ws, ['2026-07-31', '2026-08-01'])

    assert.isNull(await findEntry(ws, Number(item!.id), 2026, 7))
    assert.equal(Number((await findEntry(ws, Number(item!.id), 2026, 8))!.amount), 100)
  })

  test('datas do mesmo mes sincronizam uma vez so', async ({ assert }) => {
    const ws = await makeWorkspace('sync11@example.com')
    await addExpense(ws, '2026-08-04', '32.50')

    await new EntrySyncService().syncForDates(ws, ['2026-08-04', '2026-08-20'])

    const item = await findAutoItem(ws)
    const entries = await MonthlyEntry.query()
      .where('workspace_id', ws)
      .where('item_id', Number(item!.id))
    assert.lengthOf(entries, 1)
  })
})
```

- [ ] **Step 2: Implementar**

`api/app/modules/variable_expenses/entry_sync_service.ts`:

```ts
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Item from '#models/item'
import MonthlyEntry from '#models/monthly_entry'
import {
  isZeroAmount,
  monthRange,
  toAmountString,
} from '#modules/variable_expenses/month_range'

/** Valor de items.auto_source que identifica o item espelho dos gastos avulsos. */
export const AUTO_SOURCE = 'variable_expenses'

/** Nome inicial do item. O usuario pode renomear — a identidade e a coluna, nao o nome. */
export const AUTO_ITEM_NAME = 'Gastos do mês'

/**
 * O UNICO lugar do sistema que escreve no monthly_entry do item automatico.
 *
 * Todo caminho de escrita de variable_expenses termina aqui, e este servico e
 * idempotente: rodar syncMonth duas vezes para o mesmo mes da o mesmo resultado.
 * Nao passa por EntryService.upsert de proposito — aquele metodo mexe no contador
 * de parcelas, e o item automatico nunca e parcelado.
 */
export default class EntrySyncService {
  /** Recalcula a linha automatica de UM mes a partir da soma dos gastos. */
  async syncMonth(workspaceId: number, year: number, month: number): Promise<void> {
    const [start, end] = monthRange(year, month)

    // SUM sobre DECIMAL e exato no MySQL e volta como string pelo mysql2 —
    // nenhum float participa do caminho de escrita.
    const row = await db
      .from('variable_expenses')
      .where('workspace_id', workspaceId)
      .whereBetween('spent_on', [start, end])
      .sum('amount as total')
      .first()

    const total = toAmountString(row?.total)

    if (isZeroAmount(total)) {
      // Mes vazio: apaga a linha em vez de deixar R$ 0,00 orfao em Lancamentos.
      // Se o item nem existe (workspace que nunca lancou nada), nao cria a toa.
      const existingItem = await this.findAutoItem(workspaceId)
      if (existingItem === null) return
      await MonthlyEntry.query()
        .where('workspace_id', workspaceId)
        .where('item_id', Number(existingItem.id))
        .where('year', year)
        .where('month', month)
        .delete()
      return
    }

    const item = await this.ensureAutoItem(workspaceId)

    // paidAt e preservado: sem isso, cada gasto novo reescreveria a data de
    // pagamento do mes inteiro.
    const existing = await MonthlyEntry.query()
      .where('workspace_id', workspaceId)
      .where('item_id', Number(item.id))
      .where('year', year)
      .where('month', month)
      .first()

    await MonthlyEntry.updateOrCreate(
      { itemId: item.id, year, month },
      {
        workspaceId,
        amount: total,
        status: 'paid',
        paidAt: existing?.paidAt ?? DateTime.now(),
      }
    )
  }

  /**
   * Sincroniza todos os meses tocados por uma lista de datas, sem repetir.
   * Serve ao caso "editei a data do gasto e ele mudou de mes": os DOIS meses
   * precisam ser recalculados, ou o mes antigo fica com um total defasado.
   */
  async syncForDates(
    workspaceId: number,
    dates: Array<DateTime | string | null | undefined>
  ): Promise<void> {
    const seen = new Set<string>()
    for (const date of dates) {
      if (date === null || date === undefined) continue
      const dt = typeof date === 'string' ? DateTime.fromISO(date) : date
      if (!dt.isValid) continue
      const key = `${dt.year}-${dt.month}`
      if (seen.has(key)) continue
      seen.add(key)
      await this.syncMonth(workspaceId, dt.year, dt.month)
    }
  }

  /** O item espelho do workspace, ou null quando ainda nao existe. */
  async findAutoItem(workspaceId: number) {
    return Item.query()
      .where('workspace_id', workspaceId)
      .where('auto_source', AUTO_SOURCE)
      .first()
  }

  /**
   * Devolve o item espelho, criando-o na primeira vez.
   * Se existir mas estiver desativado, reativa — auto-cura o caso "desativei sem
   * querer e os gastos sumiram de Lancamentos", ja que monthView filtra is_active.
   */
  private async ensureAutoItem(workspaceId: number) {
    const existing = await this.findAutoItem(workspaceId)
    if (existing !== null) {
      if (!existing.isActive) {
        existing.isActive = true
        await existing.save()
      }
      return existing
    }

    return Item.create({
      workspaceId,
      autoSource: AUTO_SOURCE,
      name: AUTO_ITEM_NAME,
      kind: 'expense',
      categoryId: null,
      defaultAmount: null,
      isActive: true,
      // Ultimo da lista: e um agregado, nao um item que o usuario planejou.
      sortOrder: 999,
      installmentsTotal: null,
      installmentsPaid: null,
    })
  }
}
```

- [ ] **Step 3: Verificar**

Run: `cd api && npm run typecheck`
Expected: PASS. Os 11 testes acima **não serão executados** (exigem banco).

---

## Task 4: CRUD — validator, service, controller e rotas

**Files:**
- Create: `api/app/modules/variable_expenses/variable_expense_validator.ts`
- Create: `api/app/modules/variable_expenses/variable_expense_service.ts`
- Create: `api/app/modules/variable_expenses/variable_expenses_controller.ts`
- Modify: `api/start/routes.ts`
- Test: `api/tests/functional/variable_expenses.spec.ts`

**Interfaces:**
- Consumes: `EntrySyncService` (Task 3), `VariableExpense` (Task 1), `monthRange` (Task 2)
- Produces: rotas `GET/POST/PATCH/DELETE /api/v1/variable-expenses`; formato de resposta do GET fixado no Step 1

- [ ] **Step 1: Escrever o teste funcional primeiro**

`api/tests/functional/variable_expenses.spec.ts`:

```ts
import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import Item from '#models/item'
import MonthlyEntry from '#models/monthly_entry'
import { registerAndAuth } from '#tests/functional/helpers'

const AUTO_SOURCE = 'variable_expenses'

function autoItem(workspaceId: number) {
  return Item.query().where('workspace_id', workspaceId).where('auto_source', AUTO_SOURCE).first()
}

function autoEntry(workspaceId: number, itemId: number, year: number, month: number) {
  return MonthlyEntry.query()
    .where('workspace_id', workspaceId)
    .where('item_id', itemId)
    .where('year', year)
    .where('month', month)
    .first()
}

test.group('Variable expenses – CRUD', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('POST cria o gasto, o item automatico e o lancamento pago', async ({ client, assert }) => {
    const { token, workspace } = await registerAndAuth(client, 've1@example.com')

    const response = await client
      .post('/api/v1/variable-expenses')
      .bearerToken(token)
      .json({ amount: 32.5, spentOn: '2026-08-04', description: 'Almoço' })

    response.assertStatus(201)
    assert.equal(Number(response.body().amount), 32.5)

    const item = await autoItem(Number(workspace.id))
    assert.isNotNull(item)
    const entry = await autoEntry(Number(workspace.id), Number(item!.id), 2026, 8)
    assert.equal(Number(entry!.amount), 32.5)
    assert.equal(entry!.status, 'paid')
  })

  test('um segundo gasto soma no mesmo lancamento', async ({ client, assert }) => {
    const { token, workspace } = await registerAndAuth(client, 've2@example.com')
    const post = (amount: number, spentOn: string) =>
      client.post('/api/v1/variable-expenses').bearerToken(token).json({ amount, spentOn })

    await post(32.5, '2026-08-04')
    await post(18.9, '2026-08-04')

    const item = await autoItem(Number(workspace.id))
    const entry = await autoEntry(Number(workspace.id), Number(item!.id), 2026, 8)
    assert.equal(Number(entry!.amount), 51.4)
  })

  test('PATCH do valor atualiza o lancamento', async ({ client, assert }) => {
    const { token, workspace } = await registerAndAuth(client, 've3@example.com')
    const created = await client
      .post('/api/v1/variable-expenses')
      .bearerToken(token)
      .json({ amount: 32.5, spentOn: '2026-08-04' })

    await client
      .patch(`/api/v1/variable-expenses/${created.body().id}`)
      .bearerToken(token)
      .json({ amount: 40 })

    const item = await autoItem(Number(workspace.id))
    const entry = await autoEntry(Number(workspace.id), Number(item!.id), 2026, 8)
    assert.equal(Number(entry!.amount), 40)
  })

  test('PATCH movendo a data de julho para agosto sincroniza os dois meses', async ({
    client,
    assert,
  }) => {
    const { token, workspace } = await registerAndAuth(client, 've4@example.com')
    const created = await client
      .post('/api/v1/variable-expenses')
      .bearerToken(token)
      .json({ amount: 100, spentOn: '2026-07-31' })

    await client
      .patch(`/api/v1/variable-expenses/${created.body().id}`)
      .bearerToken(token)
      .json({ spentOn: '2026-08-01' })

    const item = await autoItem(Number(workspace.id))
    assert.isNull(await autoEntry(Number(workspace.id), Number(item!.id), 2026, 7))
    const agosto = await autoEntry(Number(workspace.id), Number(item!.id), 2026, 8)
    assert.equal(Number(agosto!.amount), 100)
  })

  test('DELETE do ultimo gasto REMOVE o lancamento', async ({ client, assert }) => {
    const { token, workspace } = await registerAndAuth(client, 've5@example.com')
    const created = await client
      .post('/api/v1/variable-expenses')
      .bearerToken(token)
      .json({ amount: 32.5, spentOn: '2026-08-04' })

    const response = await client
      .delete(`/api/v1/variable-expenses/${created.body().id}`)
      .bearerToken(token)

    response.assertStatus(200)
    response.assertBodyContains({ deleted: true })

    const item = await autoItem(Number(workspace.id))
    assert.isNull(await autoEntry(Number(workspace.id), Number(item!.id), 2026, 8))
  })

  test('GET devolve total, contagem, media e quebra por categoria', async ({ client, assert }) => {
    const { token } = await registerAndAuth(client, 've6@example.com')
    const categorias = await client.get('/api/v1/categories').bearerToken(token)
    const categoryId = Number(categorias.body()[0].id)

    const post = (amount: number, spentOn: string, cat?: number) =>
      client
        .post('/api/v1/variable-expenses')
        .bearerToken(token)
        .json(cat === undefined ? { amount, spentOn } : { amount, spentOn, categoryId: cat })

    await post(30, '2026-08-04', categoryId)
    await post(20, '2026-08-03', categoryId)
    await post(50, '2026-08-02')

    const response = await client
      .get('/api/v1/variable-expenses')
      .qs({ year: 2026, month: 8 })
      .bearerToken(token)

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.total, 100)
    assert.equal(body.count, 3)
    assert.closeTo(body.average, 33.33, 0.01)
    assert.lengthOf(body.expenses, 3)
    // mais recente primeiro
    assert.equal(body.expenses[0].spentOn, '2026-08-04')

    const comCategoria = body.byCategory.find((b: any) => b.categoryId === categoryId)
    const semCategoria = body.byCategory.find((b: any) => b.categoryId === null)
    assert.equal(comCategoria.total, 50)
    assert.equal(semCategoria.total, 50)
  })

  test('GET de mes vazio devolve zeros e nao cria item', async ({ client, assert }) => {
    const { token, workspace } = await registerAndAuth(client, 've7@example.com')

    const response = await client
      .get('/api/v1/variable-expenses')
      .qs({ year: 2026, month: 8 })
      .bearerToken(token)

    response.assertStatus(200)
    assert.equal(response.body().total, 0)
    assert.equal(response.body().count, 0)
    assert.lengthOf(response.body().expenses, 0)
    assert.isNull(await autoItem(Number(workspace.id)))
  })

  test('POST com categoria de outro workspace da 404', async ({ client }) => {
    const a = await registerAndAuth(client, 've8a@example.com')
    const b = await registerAndAuth(client, 've8b@example.com')
    const categoriasB = await client.get('/api/v1/categories').bearerToken(b.token)

    const response = await client
      .post('/api/v1/variable-expenses')
      .bearerToken(a.token)
      .json({ amount: 10, spentOn: '2026-08-04', categoryId: Number(categoriasB.body()[0].id) })

    response.assertStatus(404)
  })

  test('PATCH e DELETE de gasto de outro workspace dao 404', async ({ client }) => {
    const a = await registerAndAuth(client, 've9a@example.com')
    const b = await registerAndAuth(client, 've9b@example.com')
    const created = await client
      .post('/api/v1/variable-expenses')
      .bearerToken(a.token)
      .json({ amount: 10, spentOn: '2026-08-04' })

    const patch = await client
      .patch(`/api/v1/variable-expenses/${created.body().id}`)
      .bearerToken(b.token)
      .json({ amount: 99 })
    patch.assertStatus(404)

    const del = await client
      .delete(`/api/v1/variable-expenses/${created.body().id}`)
      .bearerToken(b.token)
    del.assertStatus(404)
  })

  test('POST recusa data com hora e valor zero', async ({ client }) => {
    const { token } = await registerAndAuth(client, 've10@example.com')

    const comHora = await client
      .post('/api/v1/variable-expenses')
      .bearerToken(token)
      .json({ amount: 10, spentOn: '2026-08-04T23:00:00.000Z' })
    comHora.assertStatus(422)

    const zero = await client
      .post('/api/v1/variable-expenses')
      .bearerToken(token)
      .json({ amount: 0, spentOn: '2026-08-04' })
    zero.assertStatus(422)
  })

  test('o total entra no dashboard como despesa paga', async ({ client, assert }) => {
    const { token } = await registerAndAuth(client, 've11@example.com')
    await client
      .post('/api/v1/variable-expenses')
      .bearerToken(token)
      .json({ amount: 32.5, spentOn: '2026-08-04' })

    const response = await client
      .get('/api/v1/dashboard')
      .qs({ year: 2026, month: 8 })
      .bearerToken(token)

    assert.equal(response.body().totalDoMes, 32.5)
    assert.equal(response.body().jaPago, 32.5)
    assert.equal(response.body().faltaPagar, 0)
  })
})
```

- [ ] **Step 2: Validator**

`api/app/modules/variable_expenses/variable_expense_validator.ts`:

```ts
import vine from '@vinejs/vine'

/** 'YYYY-MM-DD' e so isso: um ISO com hora escorregaria de dia por fuso. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Validator para GET /api/v1/variable-expenses?year=&month=
 */
export const monthQueryValidator = vine.compile(
  vine.object({
    year: vine.number().withoutDecimals(),
    month: vine.number().withoutDecimals().min(1).max(12),
  })
)

/**
 * Validator para POST /api/v1/variable-expenses
 *
 * amount      - obrigatorio, maior que zero (gasto de R$ 0 e ruido)
 * spentOn     - obrigatorio, 'YYYY-MM-DD'
 * description - opcional, ate 180 (limite da coluna)
 * categoryId  - opcional; pertinencia ao workspace conferida no service
 */
export const createVariableExpenseValidator = vine.compile(
  vine.object({
    amount: vine.number().positive(),
    spentOn: vine.string().regex(ISO_DATE),
    description: vine.string().trim().maxLength(180).optional(),
    categoryId: vine.number().withoutDecimals().nullable().optional(),
  })
)

/**
 * Validator para PATCH /api/v1/variable-expenses/:id
 * Todos os campos opcionais — so o que vier e alterado.
 * categoryId: null limpa a categoria.
 */
export const updateVariableExpenseValidator = vine.compile(
  vine.object({
    amount: vine.number().positive().optional(),
    spentOn: vine.string().regex(ISO_DATE).optional(),
    description: vine.string().trim().maxLength(180).nullable().optional(),
    categoryId: vine.number().withoutDecimals().nullable().optional(),
  })
)
```

- [ ] **Step 3: Service**

`api/app/modules/variable_expenses/variable_expense_service.ts`:

```ts
import { inject } from '@adonisjs/core'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Category from '#models/category'
import VariableExpense from '#models/variable_expense'
import EntrySyncService from '#modules/variable_expenses/entry_sync_service'
import { monthRange } from '#modules/variable_expenses/month_range'

type CreateDto = {
  amount: number
  spentOn: string
  description?: string
  categoryId?: number | null
}

type UpdateDto = {
  amount?: number
  spentOn?: string
  description?: string | null
  categoryId?: number | null
}

@inject()
export default class VariableExpenseService {
  constructor(private entrySync: EntrySyncService) {}

  /**
   * Resumo do mes + lista plana dos gastos, mais recente primeiro.
   *
   * A lista vem plana de proposito: agrupar por dia e rotular "Hoje"/"Ontem" e
   * apresentacao, e mora no cliente, onde o fuso do usuario e conhecido.
   */
  async monthView(workspaceId: number, year: number, month: number) {
    const [start, end] = monthRange(year, month)

    const expenses = await VariableExpense.query()
      .where('workspace_id', workspaceId)
      .whereBetween('spent_on', [start, end])
      .orderBy('spent_on', 'desc')
      .orderBy('id', 'desc')

    const byCategoryRows = await db
      .from('variable_expenses as e')
      .leftJoin('categories as c', 'c.id', 'e.category_id')
      .where('e.workspace_id', workspaceId)
      .whereBetween('e.spent_on', [start, end])
      .select('c.id as categoryId', 'c.name', 'c.color')
      .sum('e.amount as total')
      .groupBy('c.id', 'c.name', 'c.color')

    let total = 0
    for (const expense of expenses) total += Number(expense.amount)
    // Arredonda o acumulado de floats para 2 casas: 0.1 + 0.2 nao chega na tela.
    total = Math.round(total * 100) / 100

    const count = expenses.length

    return {
      total,
      count,
      average: count > 0 ? Math.round((total / count) * 100) / 100 : 0,
      byCategory: byCategoryRows
        .map((row) => ({
          categoryId: row.categoryId !== null ? Number(row.categoryId) : null,
          name: row.name as string | null,
          color: row.color as string | null,
          total: Number(row.total),
        }))
        .sort((a, b) => b.total - a.total),
      expenses: expenses.map((expense) => expense.serialize()),
    }
  }

  async create(workspaceId: number, dto: CreateDto) {
    await this.assertCategory(workspaceId, dto.categoryId)

    const expense = await VariableExpense.create({
      workspaceId,
      categoryId: dto.categoryId ?? null,
      spentOn: DateTime.fromISO(dto.spentOn),
      amount: dto.amount.toFixed(2),
      description: dto.description ?? null,
    })

    await this.entrySync.syncForDates(workspaceId, [expense.spentOn])
    return expense
  }

  /**
   * Atualiza um gasto. Quando a data muda de mes, os DOIS meses sao
   * ressincronizados — senao o mes antigo fica com um total defasado.
   */
  async update(workspaceId: number, id: number, dto: UpdateDto) {
    const expense = await VariableExpense.query()
      .where('workspace_id', workspaceId)
      .where('id', id)
      .firstOrFail()

    await this.assertCategory(workspaceId, dto.categoryId)

    const previousDate = expense.spentOn

    if (dto.amount !== undefined) expense.amount = dto.amount.toFixed(2)
    if (dto.spentOn !== undefined) expense.spentOn = DateTime.fromISO(dto.spentOn)
    if (dto.description !== undefined) expense.description = dto.description
    if (dto.categoryId !== undefined) expense.categoryId = dto.categoryId

    await expense.save()

    await this.entrySync.syncForDates(workspaceId, [previousDate, expense.spentOn])
    return expense
  }

  /** Delete de verdade: um gasto anotado errado nao tem por que virar historico. */
  async destroy(workspaceId: number, id: number) {
    const expense = await VariableExpense.query()
      .where('workspace_id', workspaceId)
      .where('id', id)
      .firstOrFail()

    const date = expense.spentOn
    await expense.delete()
    await this.entrySync.syncForDates(workspaceId, [date])

    return { deleted: true }
  }

  /** 404 quando a categoria e de outro workspace. null/undefined passam direto. */
  private async assertCategory(workspaceId: number, categoryId?: number | null) {
    if (categoryId === undefined || categoryId === null) return
    await Category.query()
      .where('workspace_id', workspaceId)
      .where('id', categoryId)
      .firstOrFail()
  }
}
```

- [ ] **Step 4: Controller**

`api/app/modules/variable_expenses/variable_expenses_controller.ts`:

```ts
import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import VariableExpenseService from '#modules/variable_expenses/variable_expense_service'
import {
  createVariableExpenseValidator,
  monthQueryValidator,
  updateVariableExpenseValidator,
} from '#modules/variable_expenses/variable_expense_validator'

/**
 * Dinheiro no JSON: `expenses[].amount` vem direto da coluna decimal e sai como
 * STRING; `total`, `average` e `byCategory[].total` sao agregados em JS e saem
 * como NUMERO. Mesma regra do modulo de reservas.
 */
@inject()
export default class VariableExpensesController {
  constructor(private service: VariableExpenseService) {}

  /**
   * GET /api/v1/variable-expenses?year=&month=
   * Resumo do mes + lista plana dos gastos (mais recente primeiro).
   */
  async index({ request, workspace, response }: HttpContext) {
    const { year, month } = await monthQueryValidator.validate(request.qs())
    const view = await this.service.monthView(Number(workspace.id), year, month)
    return response.ok(view)
  }

  /**
   * POST /api/v1/variable-expenses
   * Cria o gasto e ressincroniza a linha automatica antes de responder.
   */
  async store({ request, workspace, response }: HttpContext) {
    const data = await request.validateUsing(createVariableExpenseValidator)
    const expense = await this.service.create(Number(workspace.id), data)
    return response.created(expense.serialize())
  }

  /**
   * PATCH /api/v1/variable-expenses/:id
   * Escopado por workspace: 404 quando o gasto e de outro.
   */
  async update({ params, request, workspace, response }: HttpContext) {
    const data = await request.validateUsing(updateVariableExpenseValidator)
    const expense = await this.service.update(Number(workspace.id), Number(params.id), data)
    return response.ok(expense.serialize())
  }

  /**
   * DELETE /api/v1/variable-expenses/:id
   */
  async destroy({ params, workspace, response }: HttpContext) {
    const result = await this.service.destroy(Number(workspace.id), Number(params.id))
    return response.ok(result)
  }
}
```

- [ ] **Step 5: Rotas**

Em `api/start/routes.ts`, inserir o grupo abaixo logo **antes** do bloco `/**  * Protected auth routes ...`:

```ts
    /**
     * Variable expenses — gastos avulsos do dia a dia ("gastos da rua").
     * O total do mes e projetado automaticamente num monthly_entry do item
     * marcado com items.auto_source = 'variable_expenses'.
     *
     * Prefixo por extenso de proposito: `/expenses` colidiria semanticamente
     * com `items?kind=expense`, que e outra coisa.
     */
    router
      .group(() => {
        router
          .get('variable-expenses', [
            () => import('#modules/variable_expenses/variable_expenses_controller'),
            'index',
          ])
          .as('variableExpenses.index')
        router
          .post('variable-expenses', [
            () => import('#modules/variable_expenses/variable_expenses_controller'),
            'store',
          ])
          .as('variableExpenses.store')
        router
          .patch('variable-expenses/:id', [
            () => import('#modules/variable_expenses/variable_expenses_controller'),
            'update',
          ])
          .as('variableExpenses.update')
        router
          .delete('variable-expenses/:id', [
            () => import('#modules/variable_expenses/variable_expenses_controller'),
            'destroy',
          ])
          .as('variableExpenses.destroy')
      })
      .use([middleware.auth(), middleware.currentWorkspace()])
```

- [ ] **Step 6: Verificar**

Run: `cd api && npm run typecheck && npm run lint`
Expected: PASS nos dois. Os 11 testes funcionais **não serão executados**.

---

## Task 5: Trava 422 do item automático

**Files:**
- Create: `api/app/exceptions/auto_item_read_only_exception.ts`
- Modify: `api/app/modules/entries/entry_service.ts`
- Modify: `api/app/modules/items/item_service.ts`
- Test: `api/tests/functional/variable_expenses.spec.ts` (grupo novo, mesmo arquivo)

**Interfaces:**
- Consumes: `AUTO_SOURCE` (Task 3)
- Produces: `AutoItemReadOnlyException` (default export de `#exceptions/auto_item_read_only_exception`), status 422, code `E_AUTO_ITEM_READONLY`

- [ ] **Step 1: Escrever o teste primeiro**

Acrescentar ao final de `api/tests/functional/variable_expenses.spec.ts`:

```ts
test.group('Variable expenses – item automatico e somente-leitura', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  /** Cria um gasto e devolve token + o item automatico + o lancamento dele. */
  async function comGastoLancado(client: any, email: string) {
    const { token, workspace } = await registerAndAuth(client, email)
    await client
      .post('/api/v1/variable-expenses')
      .bearerToken(token)
      .json({ amount: 32.5, spentOn: '2026-08-04' })
    const item = await autoItem(Number(workspace.id))
    const entry = await autoEntry(Number(workspace.id), Number(item!.id), 2026, 8)
    return { token, workspace, item: item!, entry: entry! }
  }

  test('POST /entries/upsert no item automatico da 422', async ({ client }) => {
    const { token, item } = await comGastoLancado(client, 'lock1@example.com')

    const response = await client
      .post('/api/v1/entries/upsert')
      .bearerToken(token)
      .json({ itemId: Number(item.id), year: 2026, month: 8, amount: 999 })

    response.assertStatus(422)
  })

  test('PATCH /entries/:id do lancamento automatico da 422', async ({ client }) => {
    const { token, entry } = await comGastoLancado(client, 'lock2@example.com')

    const response = await client
      .patch(`/api/v1/entries/${entry.id}`)
      .bearerToken(token)
      .json({ amount: 999 })

    response.assertStatus(422)
  })

  test('toggle-paid do lancamento automatico da 422', async ({ client }) => {
    const { token, entry } = await comGastoLancado(client, 'lock3@example.com')

    const response = await client
      .post(`/api/v1/entries/${entry.id}/toggle-paid`)
      .bearerToken(token)

    response.assertStatus(422)
  })

  test('DELETE do item automatico da 422', async ({ client }) => {
    const { token, item } = await comGastoLancado(client, 'lock4@example.com')

    const response = await client.delete(`/api/v1/items/${item.id}`).bearerToken(token)

    response.assertStatus(422)
  })

  test('PATCH mudando o kind do item automatico da 422', async ({ client }) => {
    const { token, item } = await comGastoLancado(client, 'lock5@example.com')

    const response = await client
      .patch(`/api/v1/items/${item.id}`)
      .bearerToken(token)
      .json({ kind: 'income' })

    response.assertStatus(422)
  })

  test('PATCH renomeando e categorizando o item automatico funciona', async ({
    client,
    assert,
  }) => {
    const { token, item } = await comGastoLancado(client, 'lock6@example.com')
    const categorias = await client.get('/api/v1/categories').bearerToken(token)
    const categoryId = Number(categorias.body()[0].id)

    const response = await client
      .patch(`/api/v1/items/${item.id}`)
      .bearerToken(token)
      .json({ name: 'Rolê', categoryId })

    response.assertStatus(200)
    assert.equal(response.body().name, 'Rolê')
    assert.equal(Number(response.body().categoryId), categoryId)
  })

  test('PATCH com o mesmo kind passa (nao e uma mudanca)', async ({ client }) => {
    const { token, item } = await comGastoLancado(client, 'lock7@example.com')

    const response = await client
      .patch(`/api/v1/items/${item.id}`)
      .bearerToken(token)
      .json({ kind: 'expense', name: 'Gastos da rua' })

    response.assertStatus(200)
  })

  test('itens normais continuam editaveis e deletaveis', async ({ client }) => {
    const { token } = await registerAndAuth(client, 'lock8@example.com')
    const created = await client
      .post('/api/v1/items')
      .bearerToken(token)
      .json({ name: 'Aluguel', kind: 'expense' })

    const patch = await client
      .patch(`/api/v1/items/${created.body().id}`)
      .bearerToken(token)
      .json({ kind: 'income' })
    patch.assertStatus(200)

    const del = await client.delete(`/api/v1/items/${created.body().id}`).bearerToken(token)
    del.assertStatus(200)
  })
})
```

- [ ] **Step 2: A exceção**

`api/app/exceptions/auto_item_read_only_exception.ts`:

```ts
import { Exception } from '@adonisjs/core/exceptions'

/**
 * 422 para toda tentativa de escrever no item — ou no lancamento — gerado
 * automaticamente por uma feature (hoje so a aba Gastos).
 *
 * Mora na API, e nao so na UI, de proposito: o cadeado da tela e consequencia
 * desta excecao, nao a defesa. Sem ela, um PATCH direto dessincronizaria o total.
 */
export default class AutoItemReadOnlyException extends Exception {
  static status = 422
  static code = 'E_AUTO_ITEM_READONLY'
}
```

- [ ] **Step 3: Travar `EntryService`**

Em `api/app/modules/entries/entry_service.ts`, adicionar os imports:

```ts
import AutoItemReadOnlyException from '#exceptions/auto_item_read_only_exception'
```

Em `upsert`, logo **depois** do `firstOrFail()` que carrega o item:

```ts
    if (item.autoSource !== null) {
      throw new AutoItemReadOnlyException(
        'O valor de "Gastos do mês" é calculado pela aba Gastos e não pode ser editado aqui.'
      )
    }
```

Em `togglePaid`, logo **depois** do `firstOrFail()` que carrega o entry:

```ts
    await this.assertEntryIsEditable(workspaceId, Number(entry.itemId), 'toggle')
```

Em `update`, logo **depois** do `firstOrFail()` que carrega o entry:

```ts
    await this.assertEntryIsEditable(workspaceId, Number(entry.itemId), 'edit')
```

E o método privado novo, ao final da classe:

```ts
  /**
   * Barra escrita em lancamento de item automatico.
   * `intent` so muda a mensagem: 'toggle' fala de status, 'edit' fala de valor.
   */
  private async assertEntryIsEditable(
    workspaceId: number,
    itemId: number,
    intent: 'toggle' | 'edit'
  ) {
    const item = await Item.query()
      .where('workspace_id', workspaceId)
      .where('id', itemId)
      .first()
    if (!item || item.autoSource === null) return

    throw new AutoItemReadOnlyException(
      intent === 'toggle'
        ? 'Gastos já lançados contam sempre como pagos.'
        : 'O valor de "Gastos do mês" é calculado pela aba Gastos e não pode ser editado aqui.'
    )
  }
```

- [ ] **Step 4: Travar `ItemService`**

Em `api/app/modules/items/item_service.ts`, adicionar o import:

```ts
import AutoItemReadOnlyException from '#exceptions/auto_item_read_only_exception'
```

Em `update`, logo **depois** do `firstOrFail()`:

```ts
    // Renomear e recategorizar sao permitidos no item automatico — e o que a
    // feature promete. Trocar o tipo, nao: viraria receita/cartao e sairia da
    // conta de despesas sem que ninguem percebesse.
    if (item.autoSource !== null && dto.kind !== undefined && dto.kind !== item.kind) {
      throw new AutoItemReadOnlyException('Não dá para mudar o tipo do item de gastos.')
    }
```

Em `deactivateOrDelete`, logo **depois** do `firstOrFail()`:

```ts
    if (item.autoSource !== null) {
      throw new AutoItemReadOnlyException(
        'Esse item é gerado pela aba Gastos. Apague os gastos do mês para zerá-lo.'
      )
    }
```

- [ ] **Step 5: Verificar**

Run: `cd api && npm run typecheck && npm run lint`
Expected: PASS nos dois. Os 8 testes acima **não serão executados**.

---

## Task 6: Script SQL para produção

**Files:**
- Create: `docs/sql/2026-08-04-gastos-variaveis.sql`

- [ ] **Step 1: Escrever o script**

`docs/sql/2026-08-04-gastos-variaveis.sql`:

```sql
-- ============================================================================
-- Lefinance — Gastos Variaveis ("gastos da rua")
-- Data: 2026-08-04
--
-- COMO USAR (phpMyAdmin):
--   1. Selecione o banco `lefinance-db` na barra lateral
--   2. Aba "SQL"
--   3. Cole ESTE ARQUIVO INTEIRO e clique em "Executar"
--
-- ATENCAO: este arquivo e ALTERNATIVO a `node ace migration:run`.
-- Rodar os dois no mesmo banco faz o segundo falhar com "table already exists".
-- Se voce rodar este script, os INSERTs do passo 3 marcam as migrations como
-- ja aplicadas, e o `migration:run` passa direto por elas no futuro.
-- ============================================================================


-- ── PASSO 1 · coluna `auto_source` em `items` ───────────────────────────────
-- Marca o item gerado pela aba Gastos. NULL = item normal, criado por voce.
-- O indice unico garante UM item automatico por workspace; o InnoDB permite
-- varios NULLs num indice unico, entao seus itens normais nao sao afetados.

ALTER TABLE `items`
  ADD COLUMN `auto_source` VARCHAR(32) NULL AFTER `kind`;

CREATE UNIQUE INDEX `items_workspace_auto_source_unique`
  ON `items` (`workspace_id`, `auto_source`);


-- ── PASSO 2 · tabela `variable_expenses` ────────────────────────────────────
-- Um registro por gasto anotado. `spent_on` e a unica coisa que define a qual
-- mes o gasto pertence — nao existe coluna de ano/mes denormalizada.

CREATE TABLE `variable_expenses` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `workspace_id`  BIGINT UNSIGNED NULL,
  `category_id`   BIGINT UNSIGNED NULL,
  `spent_on`      DATE NOT NULL,
  `amount`        DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `description`   VARCHAR(180) NULL,
  `created_at`    TIMESTAMP NULL,
  `updated_at`    TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  KEY `variable_expenses_ws_spent_on_index` (`workspace_id`, `spent_on`),
  KEY `variable_expenses_ws_category_index` (`workspace_id`, `category_id`),
  CONSTRAINT `variable_expenses_workspace_id_foreign`
    FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE,
  CONSTRAINT `variable_expenses_category_id_foreign`
    FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── PASSO 3 · marcar as migrations como aplicadas ───────────────────────────
-- Sem isto, um `node ace migration:run` futuro tenta recriar tudo e quebra.
--
-- CONFIRA ANTES: rode a linha abaixo sozinha e veja o formato do campo `name`
-- nas linhas existentes. Deve ser 'database/migrations/<arquivo sem .ts>'.
-- Se no seu banco o prefixo for diferente, ajuste os dois INSERTs para bater.
--
--   SELECT * FROM `adonis_schema` ORDER BY `id` DESC LIMIT 3;

INSERT INTO `adonis_schema` (`name`, `batch`, `migration_time`)
SELECT 'database/migrations/1782900000001_add_auto_source_to_items',
       COALESCE(MAX(`batch`), 0) + 1,
       NOW()
FROM `adonis_schema`;

INSERT INTO `adonis_schema` (`name`, `batch`, `migration_time`)
SELECT 'database/migrations/1782900000002_create_variable_expenses_table',
       MAX(`batch`),
       NOW()
FROM `adonis_schema`;


-- ── CONFERENCIA (opcional) ──────────────────────────────────────────────────
-- Deve devolver a coluna nova e a tabela nova.
--
--   SHOW COLUMNS FROM `items` LIKE 'auto_source';
--   SHOW CREATE TABLE `variable_expenses`;


-- ============================================================================
-- COMO DESFAZER (se precisar voltar atras)
-- ============================================================================
--
--   DROP TABLE IF EXISTS `variable_expenses`;
--   DROP INDEX `items_workspace_auto_source_unique` ON `items`;
--   ALTER TABLE `items` DROP COLUMN `auto_source`;
--   DELETE FROM `adonis_schema`
--     WHERE `name` IN (
--       'database/migrations/1782900000001_add_auto_source_to_items',
--       'database/migrations/1782900000002_create_variable_expenses_table'
--     );
--
-- Os lancamentos ja criados em `monthly_entries` para o item automatico NAO sao
-- removidos por isso — apague-os manualmente se quiser limpar de vez:
--   DELETE e FROM `monthly_entries` e
--     JOIN `items` i ON i.id = e.item_id
--     WHERE i.auto_source = 'variable_expenses';
-- (rode ANTES do DROP COLUMN, senao a coluna nao existe mais)
-- ============================================================================
```

- [ ] **Step 2: Verificar**

Nada a executar — não há MySQL acessível. Reler o arquivo confirmando que:
- os nomes de índice batem com os das migrations das Tasks 1 (`items_workspace_auto_source_unique`, `variable_expenses_ws_spent_on_index`, `variable_expenses_ws_category_index`)
- os nomes de constraint batem com o que o Knex geraria (`<tabela>_<coluna>_foreign`)
- a ordem de desfazer está invertida em relação à de aplicar

---

## Task 7: Web — `grouping.ts` e `useVariableExpenses.ts`

**Files:**
- Create: `web/src/features/gastos/grouping.ts`
- Create: `web/src/features/gastos/useVariableExpenses.ts`
- Test: `web/src/features/gastos/grouping.test.ts`

**Interfaces:**
- Produces: `VariableExpense`, `MonthView`, `DayGroup` (tipos) · `groupByDay(expenses): DayGroup[]` · `dayLabel(isoDate, today): string` · `todayISO(): string` · hooks `useVariableExpenses(year, month)`, `useCreateExpense(year, month)`, `useUpdateExpense(year, month)`, `useDeleteExpense(year, month)`

- [ ] **Step 1: Escrever o teste primeiro**

`web/src/features/gastos/grouping.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { groupByDay, dayLabel } from './grouping'
import type { VariableExpense } from './useVariableExpenses'

function gasto(id: string, spentOn: string, amount: string): VariableExpense {
  return { id, spentOn, amount, description: null, categoryId: null }
}

describe('groupByDay', () => {
  it('agrupa por data com o dia mais recente primeiro', () => {
    const groups = groupByDay([
      gasto('1', '2026-08-03', '84.10'),
      gasto('2', '2026-08-04', '32.50'),
      gasto('3', '2026-08-04', '18.90'),
    ])

    expect(groups.map((g) => g.date)).toEqual(['2026-08-04', '2026-08-03'])
    expect(groups[0].expenses).toHaveLength(2)
  })

  it('soma o total do dia em centavos, sem erro de float', () => {
    // 0.1 + 0.2 em float da 0.30000000000000004 — nao pode chegar na tela.
    const groups = groupByDay([
      gasto('1', '2026-08-04', '0.10'),
      gasto('2', '2026-08-04', '0.20'),
    ])
    expect(groups[0].total).toBe(0.3)
  })

  it('devolve lista vazia para entrada vazia', () => {
    expect(groupByDay([])).toEqual([])
  })

  it('separa dias de meses diferentes', () => {
    const groups = groupByDay([
      gasto('1', '2026-07-31', '10.00'),
      gasto('2', '2026-08-01', '20.00'),
    ])
    expect(groups.map((g) => g.date)).toEqual(['2026-08-01', '2026-07-31'])
  })
})

describe('dayLabel', () => {
  const hoje = new Date(2026, 7, 4) // 4 de agosto de 2026 (mes 0-indexado)

  it('rotula o dia de hoje', () => {
    expect(dayLabel('2026-08-04', hoje)).toBe('Hoje, 04/08')
  })

  it('rotula o dia de ontem', () => {
    expect(dayLabel('2026-08-03', hoje)).toBe('Ontem, 03/08')
  })

  it('usa o dia da semana para datas mais antigas', () => {
    // 02/08/2026 e um domingo
    expect(dayLabel('2026-08-02', hoje)).toBe('dom, 02/08')
  })

  it('atravessa a virada de mes corretamente', () => {
    const primeiroDeAgosto = new Date(2026, 7, 1)
    expect(dayLabel('2026-07-31', primeiroDeAgosto)).toBe('Ontem, 31/07')
  })

  it('atravessa a virada de ano corretamente', () => {
    const primeiroDeJaneiro = new Date(2027, 0, 1)
    expect(dayLabel('2026-12-31', primeiroDeJaneiro)).toBe('Ontem, 31/12')
  })
})
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `cd web && npm test -- grouping`
Expected: FAIL — `Failed to resolve import "./grouping"`.

- [ ] **Step 3: Implementar `grouping.ts`**

`web/src/features/gastos/grouping.ts`:

```ts
import type { VariableExpense } from './useVariableExpenses'

export interface DayGroup {
  /** 'YYYY-MM-DD' */
  date: string
  /** Soma dos gastos do dia, em reais. */
  total: number
  expenses: VariableExpense[]
}

const WEEKDAYS_PT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const

/**
 * Hoje em 'YYYY-MM-DD', montado com getFullYear/getMonth/getDate.
 * NUNCA `toISOString()`: ele converte para UTC e, em fuso negativo, devolve o
 * dia anterior depois das 21h — o gasto cairia no dia (e no mes) errado.
 */
export function todayISO(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

/** 'YYYY-MM-DD' → Date local a meia-noite (sem passar por UTC). */
function parseISODate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/**
 * Agrupa os gastos por dia, do mais recente para o mais antigo.
 * O total de cada dia e somado em CENTAVOS INTEIROS: e a unica soma repetida
 * de dinheiro no web, e `0.1 + 0.2 = 0.30000000000000004` nao pode aparecer.
 */
export function groupByDay(expenses: VariableExpense[]): DayGroup[] {
  const byDate = new Map<string, VariableExpense[]>()

  for (const expense of expenses) {
    const list = byDate.get(expense.spentOn)
    if (list === undefined) {
      byDate.set(expense.spentOn, [expense])
    } else {
      list.push(expense)
    }
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([date, list]) => {
      let cents = 0
      for (const expense of list) cents += Math.round(Number(expense.amount) * 100)
      return { date, total: cents / 100, expenses: list }
    })
}

/**
 * Rotulo humano do dia: 'Hoje, 04/08', 'Ontem, 03/08' ou 'dom, 02/08'.
 * `today` entra por parametro para o teste nao depender do relogio.
 */
export function dayLabel(isoDate: string, today: Date): string {
  const date = parseISODate(isoDate)
  const dayMonth = `${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}`

  const midnightToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const diffDays = Math.round((midnightToday.getTime() - date.getTime()) / 86_400_000)

  if (diffDays === 0) return `Hoje, ${dayMonth}`
  if (diffDays === 1) return `Ontem, ${dayMonth}`
  return `${WEEKDAYS_PT[date.getDay()]}, ${dayMonth}`
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `cd web && npm test -- grouping`
Expected: PASS, 9 testes.

- [ ] **Step 5: Implementar `useVariableExpenses.ts`**

`web/src/features/gastos/useVariableExpenses.ts`:

```ts
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
  categoryId: string | null
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
  description?: string
  categoryId?: number | null
}

// ── Query key ────────────────────────────────────────────────────────────────

export const expensesKey = (year: number, month: number) =>
  ['variable-expenses', year, month] as const

/** 'YYYY-MM-DD' → { year, month } (mes 1-based). */
function periodOf(iso: string): { year: number; month: number } {
  return { year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) }
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
 * Tudo que um gasto afeta. `periods` traz os pares (ano, mes) tocados pela
 * operacao — normalmente um so, mas DOIS quando a edicao moveu a data de mes.
 * Sem invalidar o mes antigo, a tela de Lancamentos dele fica com um total
 * defasado ate um F5.
 */
function invalidateAll(
  qc: ReturnType<typeof useQueryClient>,
  periods: Array<{ year: number; month: number }>
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

// ── useCreateExpense ─────────────────────────────────────────────────────────

interface MutationContext {
  previous?: MonthView
}

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
          id: '__optimistic__',
          amount: payload.amount.toFixed(2),
          spentOn: payload.spentOn,
          description: payload.description ?? null,
          categoryId: payload.categoryId != null ? String(payload.categoryId) : null,
        }
        const expenses = [optimistic, ...old.expenses]
        const total = Math.round((old.total + payload.amount) * 100) / 100
        return {
          ...old,
          total,
          count: old.count + 1,
          average: Math.round((total / (old.count + 1)) * 100) / 100,
          expenses,
        }
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
            : expense
        )
        let cents = 0
        for (const expense of expenses) cents += Math.round(Number(expense.amount) * 100)
        const total = cents / 100
        return {
          ...old,
          total,
          average: expenses.length > 0 ? Math.round((total / expenses.length) * 100) / 100 : 0,
          expenses,
        }
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
        const expenses = old.expenses.filter((expense) => expense.id !== id)
        let cents = 0
        for (const expense of expenses) cents += Math.round(Number(expense.amount) * 100)
        const total = cents / 100
        return {
          ...old,
          total,
          count: expenses.length,
          average: expenses.length > 0 ? Math.round((total / expenses.length) * 100) / 100 : 0,
          expenses,
        }
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
```

- [ ] **Step 6: Verificar**

Run: `cd web && npm test -- grouping && npx tsc -b --noEmit`
Expected: testes PASS; typecheck sem erro.

---

## Task 8: Web — componentes e página `/gastos`

**Files:**
- Create: `web/src/features/gastos/CategorySummary.tsx`
- Create: `web/src/features/gastos/ExpenseRow.tsx`
- Create: `web/src/features/gastos/DayGroup.tsx`
- Create: `web/src/features/gastos/ExpenseFormDialog.tsx`
- Create: `web/src/features/gastos/GastosPage.tsx`
- Test: `web/src/features/gastos/GastosPage.test.tsx`
- Modify: `web/src/app/router.tsx`
- Modify: `web/src/app/AppLayout.tsx`

**Interfaces:**
- Consumes: tudo da Task 7; `MonthYearPicker` de `@/features/dashboard/MonthYearPicker`; `parseAmountInput` de `@/features/lancamentos/math`; `formatBRL`, `MONTHS_PT` de `@/lib/format`; `useCategories` de `@/features/categorias/useCategories`
- Produces: `GastosPage` (default export), rota `/gastos`

- [ ] **Step 1: Escrever o teste primeiro**

`web/src/features/gastos/GastosPage.test.tsx` — testa os componentes de apresentação puros, sem `QueryClientProvider` (mesmo padrão de `GoalProgressBar.test.tsx`):

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { CategorySummary } from './CategorySummary'
import { DayGroup } from './DayGroup'
import type { VariableExpense } from './useVariableExpenses'

function gasto(
  id: string,
  spentOn: string,
  amount: string,
  description: string | null = null,
): VariableExpense {
  return { id, spentOn, amount, description, categoryId: null }
}

describe('CategorySummary', () => {
  it('lista as categorias com o total formatado, maior primeiro', () => {
    render(
      <CategorySummary
        byCategory={[
          { categoryId: 1, name: 'Alimentação', color: '#ef4444', total: 210.4 },
          { categoryId: 2, name: 'Transporte', color: '#3b82f6', total: 143.2 },
        ]}
      />,
    )
    expect(screen.getByText('Alimentação')).toBeInTheDocument()
    expect(screen.getByText('R$ 210,40')).toBeInTheDocument()
    expect(screen.getByText('R$ 143,20')).toBeInTheDocument()
  })

  it('chama de "Sem categoria" o balde sem categoria', () => {
    render(
      <CategorySummary
        byCategory={[{ categoryId: null, name: null, color: null, total: 134 }]}
      />,
    )
    expect(screen.getByText('Sem categoria')).toBeInTheDocument()
  })

  it('não renderiza nada quando a lista está vazia', () => {
    const { container } = render(<CategorySummary byCategory={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('DayGroup', () => {
  const hoje = new Date(2026, 7, 4)

  it('mostra o rótulo do dia, o total e cada gasto', () => {
    render(
      <DayGroup
        group={{
          date: '2026-08-04',
          total: 51.4,
          expenses: [
            gasto('1', '2026-08-04', '32.50', 'Almoço'),
            gasto('2', '2026-08-04', '18.90', 'Uber'),
          ],
        }}
        today={hoje}
        categoryById={new Map()}
        onSelect={() => {}}
      />,
    )
    expect(screen.getByText('Hoje, 04/08')).toBeInTheDocument()
    expect(screen.getByText('R$ 51,40')).toBeInTheDocument()
    expect(screen.getByText('Almoço')).toBeInTheDocument()
    expect(screen.getByText('R$ 32,50')).toBeInTheDocument()
  })

  it('usa um traço quando o gasto não tem descrição', () => {
    render(
      <DayGroup
        group={{ date: '2026-08-04', total: 32.5, expenses: [gasto('1', '2026-08-04', '32.50')] }}
        today={hoje}
        categoryById={new Map()}
        onSelect={() => {}}
      />,
    )
    expect(screen.getByText('Gasto sem descrição')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `cd web && npm test -- GastosPage`
Expected: FAIL — `Failed to resolve import "./CategorySummary"`.

- [ ] **Step 3: `CategorySummary.tsx`**

```tsx
import { formatBRL } from '@/lib/format'
import type { CategoryTotal } from './useVariableExpenses'

interface CategorySummaryProps {
  byCategory: CategoryTotal[]
}

/** Chips com a cor da categoria e o total gasto nela no mês. */
export function CategorySummary({ byCategory }: CategorySummaryProps) {
  if (byCategory.length === 0) return null

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      {byCategory.map((entry) => (
        <span
          key={entry.categoryId ?? '__none__'}
          className="inline-flex items-center gap-1.5 text-sm"
        >
          <span
            className="inline-block h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: entry.color ?? '#94a3b8' }}
          />
          <span className="text-muted-foreground">{entry.name ?? 'Sem categoria'}</span>
          <span className="font-medium tabular-nums">{formatBRL(entry.total)}</span>
        </span>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: `ExpenseRow.tsx`**

```tsx
import { formatBRL } from '@/lib/format'
import type { VariableExpense } from './useVariableExpenses'

interface ExpenseRowProps {
  expense: VariableExpense
  categoryById: Map<string, { name: string; color: string }>
  onSelect: (expense: VariableExpense) => void
}

/** Uma linha de gasto. A linha inteira é o alvo de toque — abre a edição. */
export function ExpenseRow({ expense, categoryById, onSelect }: ExpenseRowProps) {
  const category = expense.categoryId != null ? categoryById.get(expense.categoryId) : undefined

  return (
    <button
      type="button"
      onClick={() => onSelect(expense)}
      className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">
          {expense.description ?? 'Gasto sem descrição'}
        </span>
        {category !== undefined && (
          <span className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: category.color }}
            />
            {category.name}
          </span>
        )}
      </span>
      <span className="shrink-0 text-sm font-semibold tabular-nums">
        {formatBRL(Number(expense.amount))}
      </span>
    </button>
  )
}
```

- [ ] **Step 5: `DayGroup.tsx`**

```tsx
import { formatBRL } from '@/lib/format'
import { dayLabel, type DayGroup as DayGroupData } from './grouping'
import { ExpenseRow } from './ExpenseRow'
import type { VariableExpense } from './useVariableExpenses'

interface DayGroupProps {
  group: DayGroupData
  /** Injetado para o teste não depender do relógio. */
  today: Date
  categoryById: Map<string, { name: string; color: string }>
  onSelect: (expense: VariableExpense) => void
}

/** Cabeçalho do dia ("Hoje, 04/08" + total) seguido dos gastos daquele dia. */
export function DayGroup({ group, today, categoryById, onSelect }: DayGroupProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between border-b border-border pb-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {dayLabel(group.date, today)}
        </span>
        <span className="text-xs font-medium tabular-nums text-muted-foreground">
          {formatBRL(group.total)}
        </span>
      </div>
      {group.expenses.map((expense) => (
        <ExpenseRow
          key={expense.id}
          expense={expense}
          categoryById={categoryById}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 6: Rodar o teste e ver passar**

Run: `cd web && npm test -- GastosPage`
Expected: PASS, 5 testes.

- [ ] **Step 7: `ExpenseFormDialog.tsx`**

Segue o padrão de `features/reservas/MovementFormDialog.tsx` (react-hook-form + zod + sonner):

```tsx
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { LoaderCircle, Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { parseAmountInput } from '@/features/lancamentos/math'
import { useCategories } from '@/features/categorias/useCategories'
import { todayISO } from './grouping'
import {
  useCreateExpense,
  useDeleteExpense,
  useUpdateExpense,
  type VariableExpense,
} from './useVariableExpenses'

const NO_CATEGORY = '__none__'

const expenseSchema = z.object({
  amount: z
    .string()
    .min(1, 'Informe o valor')
    .refine((value) => {
      const parsed = parseAmountInput(value)
      return parsed !== null && parsed > 0
    }, 'Valor inválido'),
  spentOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida'),
  description: z.string().max(180, 'Máximo de 180 caracteres').optional(),
  categoryId: z.string(),
})

type ExpenseFormData = z.infer<typeof expenseSchema>

interface ExpenseFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Gasto em edição, ou null para criar um novo. */
  expense: VariableExpense | null
  year: number
  month: number
}

export function ExpenseFormDialog({
  open,
  onOpenChange,
  expense,
  year,
  month,
}: ExpenseFormDialogProps) {
  const { data: categories } = useCategories()
  const create = useCreateExpense(year, month)
  const update = useUpdateExpense(year, month)
  const remove = useDeleteExpense(year, month)

  const form = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseSchema),
    defaultValues: { amount: '', spentOn: todayISO(), description: '', categoryId: NO_CATEGORY },
  })

  // Re-preenche sempre que o diálogo abre, para não herdar o gasto anterior.
  useEffect(() => {
    if (!open) return
    form.reset(
      expense
        ? {
            amount: String(Number(expense.amount)),
            spentOn: expense.spentOn,
            description: expense.description ?? '',
            categoryId: expense.categoryId ?? NO_CATEGORY,
          }
        : { amount: '', spentOn: todayISO(), description: '', categoryId: NO_CATEGORY },
    )
  }, [open, expense, form])

  const pending = create.isPending || update.isPending || remove.isPending

  function onSubmit(data: ExpenseFormData) {
    const amount = parseAmountInput(data.amount)
    if (amount === null) return

    const payload = {
      amount,
      spentOn: data.spentOn,
      description: data.description?.trim() ? data.description.trim() : undefined,
      categoryId: data.categoryId === NO_CATEGORY ? null : Number(data.categoryId),
    }

    if (expense) {
      update.mutate(
        { id: expense.id, previousSpentOn: expense.spentOn, payload },
        {
          onSuccess: () => {
            toast.success('Gasto atualizado')
            onOpenChange(false)
          },
          onError: () => toast.error('Não deu para salvar. Tente de novo.'),
        },
      )
      return
    }

    create.mutate(payload, {
      onSuccess: () => {
        toast.success('Gasto anotado')
        onOpenChange(false)
      },
      onError: () => toast.error('Não deu para salvar. Tente de novo.'),
    })
  }

  function onDelete() {
    if (!expense) return
    remove.mutate(
      { id: expense.id, spentOn: expense.spentOn },
      {
        onSuccess: () => {
          toast.success('Gasto excluído')
          onOpenChange(false)
        },
        onError: () => toast.error('Não deu para excluir. Tente de novo.'),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{expense ? 'Editar gasto' : 'Novo gasto'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="amount">Valor</Label>
            <Input
              id="amount"
              inputMode="decimal"
              placeholder="0,00"
              autoFocus
              {...form.register('amount')}
            />
            {form.formState.errors.amount && (
              <p className="text-xs text-destructive">{form.formState.errors.amount.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">O que foi</Label>
            <Input id="description" placeholder="Almoço, Uber…" {...form.register('description')} />
            {form.formState.errors.description && (
              <p className="text-xs text-destructive">
                {form.formState.errors.description.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="spentOn">Data</Label>
            <Input id="spentOn" type="date" {...form.register('spentOn')} />
            {form.formState.errors.spentOn && (
              <p className="text-xs text-destructive">{form.formState.errors.spentOn.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="categoryId">Categoria</Label>
            <Select
              value={form.watch('categoryId')}
              onValueChange={(value) => form.setValue('categoryId', value)}
            >
              <SelectTrigger id="categoryId">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CATEGORY}>Sem categoria</SelectItem>
                {(categories ?? []).map((category) => (
                  <SelectItem key={category.id} value={String(category.id)}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            {expense ? (
              <Button
                type="button"
                variant="ghost"
                onClick={onDelete}
                disabled={pending}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                Excluir
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={pending}>
              {pending && <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 8: `GastosPage.tsx`**

```tsx
import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { MonthYearPicker } from '@/features/dashboard/MonthYearPicker'
import { useCategories } from '@/features/categorias/useCategories'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatBRL, MONTHS_PT } from '@/lib/format'
import { CategorySummary } from './CategorySummary'
import { DayGroup } from './DayGroup'
import { ExpenseFormDialog } from './ExpenseFormDialog'
import { groupByDay } from './grouping'
import { useVariableExpenses, type VariableExpense } from './useVariableExpenses'

export default function GastosPage() {
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [month, setMonth] = useState(() => new Date().getMonth() + 1)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<VariableExpense | null>(null)

  const { data, isLoading, isError } = useVariableExpenses(year, month)
  const { data: categories } = useCategories()

  const categoryById = useMemo(() => {
    const map = new Map<string, { name: string; color: string }>()
    for (const category of categories ?? []) {
      map.set(String(category.id), { name: category.name, color: category.color ?? '#94a3b8' })
    }
    return map
  }, [categories])

  const groups = useMemo(() => groupByDay(data?.expenses ?? []), [data])
  const today = useMemo(() => new Date(), [])
  const monthLabel = MONTHS_PT[month - 1]

  function openNew() {
    setEditing(null)
    setDialogOpen(true)
  }

  function openEdit(expense: VariableExpense) {
    // Uma linha otimista ainda não existe no servidor — editá-la daria 404.
    if (expense.id === '__optimistic__') return
    setEditing(expense)
    setDialogOpen(true)
  }

  return (
    <div className="space-y-6 pb-24 lg:pb-0">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Gastos</h1>
          <p className="text-sm text-muted-foreground">
            {monthLabel} {year} — o que você gastou na rua, fora dos gastos fixos
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MonthYearPicker
            year={year}
            month={month}
            onYearChange={setYear}
            onMonthChange={setMonth}
          />
          <Button onClick={openNew} className="hidden lg:inline-flex">
            <Plus className="mr-1.5 h-4 w-4" />
            Novo gasto
          </Button>
        </div>
      </div>

      {/* ── Totais ── */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          {isLoading && (
            <div className="space-y-3">
              <Skeleton className="mx-auto h-10 w-48" />
              <Skeleton className="mx-auto h-4 w-64" />
            </div>
          )}

          {isError && (
            <p className="py-4 text-center text-sm text-destructive">
              Erro ao carregar os gastos. Tente novamente.
            </p>
          )}

          {!isLoading && !isError && data && (
            <>
              <div className="text-center">
                <p className="text-3xl font-bold tabular-nums text-foreground">
                  {formatBRL(data.total)}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {data.count === 1 ? '1 gasto' : `${data.count} gastos`}
                  {data.count > 0 && ` · média ${formatBRL(data.average)}`}
                </p>
              </div>
              <CategorySummary byCategory={data.byCategory} />
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Lista ── */}
      {!isLoading && !isError && data && (
        <Card>
          <CardContent className="space-y-5 pt-6">
            {groups.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhum gasto anotado em {monthLabel}. Toque em + para anotar o primeiro.
              </p>
            ) : (
              groups.map((group) => (
                <DayGroup
                  key={group.date}
                  group={group}
                  today={today}
                  categoryById={categoryById}
                  onSelect={openEdit}
                />
              ))
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Botão flutuante (mobile) ── */}
      <Button
        onClick={openNew}
        size="icon"
        aria-label="Novo gasto"
        className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full shadow-lg lg:hidden"
      >
        <Plus className="h-6 w-6" />
      </Button>

      <ExpenseFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        expense={editing}
        year={year}
        month={month}
      />
    </div>
  )
}
```

- [ ] **Step 9: Rota e nav**

Em `web/src/app/router.tsx`, adicionar o import e a rota:

```tsx
import GastosPage from '@/features/gastos/GastosPage'
```

```tsx
          { path: 'gastos', element: <GastosPage /> },
```

(logo depois da linha de `lancamentos`)

Em `web/src/app/AppLayout.tsx`, adicionar `Receipt` ao import de `lucide-react` e a entrada de nav logo depois de Lançamentos:

```tsx
  { to: '/gastos', label: 'Gastos', icon: Receipt },
```

- [ ] **Step 10: Verificar**

Run: `cd web && npm test && npm run build`
Expected: toda a suíte PASS; build sem erro de tipo.

---

## Task 9: Web — cadeado em Lançamentos

**Files:**
- Modify: `web/src/features/lancamentos/useEntries.ts`
- Modify: `web/src/features/lancamentos/EntryRow.tsx`
- Test: `web/src/features/lancamentos/EntryRow.test.tsx` (criar)

**Interfaces:**
- Consumes: `EntryItem.autoSource` vindo da API (Task 1)

- [ ] **Step 1: Escrever o teste primeiro**

`web/src/features/lancamentos/EntryRow.test.tsx` — o `EntryRow` usa hooks de mutação, então o teste cobre o subcomponente novo de apresentação. Criar `LockedAmount` como componente exportado e testá-lo:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LockedAmount } from './LockedAmount'

describe('LockedAmount', () => {
  it('mostra o valor formatado e não renderiza input', () => {
    const { container } = render(<LockedAmount amount="487.60" />)
    expect(screen.getByText('R$ 487,60')).toBeInTheDocument()
    expect(container.querySelector('input')).toBeNull()
  })

  it('mostra traço quando ainda não há lançamento no mês', () => {
    render(<LockedAmount amount={null} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('explica de onde vem o valor', () => {
    render(<LockedAmount amount="487.60" />)
    expect(screen.getByTitle('Calculado pela aba Gastos')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `cd web && npm test -- EntryRow`
Expected: FAIL — `Failed to resolve import "./LockedAmount"`.

- [ ] **Step 3: `LockedAmount.tsx`**

`web/src/features/lancamentos/LockedAmount.tsx`:

```tsx
import { Lock } from 'lucide-react'
import { formatBRL } from '@/lib/format'

interface LockedAmountProps {
  /** Valor do lançamento (string decimal), ou null quando o mês não tem gastos. */
  amount: string | null
}

/**
 * Valor somente-leitura da linha automática.
 * O cadeado é a consequência visual da trava — a defesa de verdade é o 422 da API.
 */
export function LockedAmount({ amount }: LockedAmountProps) {
  return (
    <span
      title="Calculado pela aba Gastos"
      className="inline-flex items-center justify-end gap-1.5 text-sm tabular-nums text-muted-foreground"
    >
      <Lock className="h-3 w-3 shrink-0" />
      {amount !== null ? formatBRL(Number(amount)) : '—'}
    </span>
  )
}
```

- [ ] **Step 4: Tipo em `useEntries.ts`**

Em `web/src/features/lancamentos/useEntries.ts`, dentro de `interface EntryItem`, acrescentar:

```ts
  /** 'variable_expenses' quando o item é gerado pela aba Gastos; null nos itens normais. */
  autoSource?: string | null
```

- [ ] **Step 5: Usar em `EntryRow.tsx`**

Em `web/src/features/lancamentos/EntryRow.tsx`, adicionar os imports:

```tsx
import { Link } from 'react-router-dom'
import { LockedAmount } from './LockedAmount'
```

Logo após `const { item, entry } = row`:

```tsx
  const isAuto = item.autoSource != null
```

Trocar a célula do valor por:

```tsx
      {/* Editable amount — travado quando o item é gerado pela aba Gastos */}
      <TableCell className="text-right">
        {isAuto ? (
          <LockedAmount amount={entry?.amount ?? null} />
        ) : (
          <EditableAmount
            entry={entry}
            defaultAmount={item.defaultAmount}
            onCommit={handleCommit}
          />
        )}
      </TableCell>
```

E a célula de status por:

```tsx
      {/* Status — a linha automática conta sempre como paga */}
      <TableCell>
        {isAuto ? (
          <Link
            to="/gastos"
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            ver gastos
          </Link>
        ) : (
          <StatusToggle
            entry={entry}
            kind={item.kind}
            onToggle={handleToggle}
            isPending={toggleBusy}
          />
        )}
      </TableCell>
```

- [ ] **Step 6: Rodar o teste e ver passar**

Run: `cd web && npm test -- EntryRow`
Expected: PASS, 3 testes.

- [ ] **Step 7: Verificar tudo**

Run: `cd web && npm test && npm run build`
Expected: suíte inteira PASS; build limpo.

---

## Task 10: Verificação final e relatório

- [ ] **Step 1: API**

Run: `cd api && npm run typecheck && npm run lint`
Expected: PASS nos dois.

- [ ] **Step 2: Web**

Run: `cd web && npm test && npm run build && npm run lint`
Expected: PASS nos três.

- [ ] **Step 3: Relatar com honestidade**

O relatório final ao usuário DEVE dizer, sem suavizar:
- `api/database/schema.ts` foi **editado à mão**, contra o aviso do próprio arquivo, porque não havia MySQL acessível
- os **30 testes da API** (11 unit de helpers + 11 unit de sync + 11 funcionais de CRUD + 8 funcionais de trava) foram **escritos e nunca executados**
- o que **foi** verificado: typecheck e lint da API, e a suíte do web rodando de verdade
- o passo que falta ao usuário: rodar `docs/sql/2026-08-04-gastos-variaveis.sql` no phpMyAdmin antes de usar a feature

- [ ] **Step 4: Commits (só se o usuário pedir)**

```bash
git add api/database/migrations api/app/models/variable_expense.ts api/database/schema.ts
git commit -m "feat(api): tabela variable_expenses e coluna items.auto_source"

git add api/app/modules/variable_expenses api/app/exceptions/auto_item_read_only_exception.ts api/start/routes.ts api/app/modules/entries api/app/modules/items api/tests
git commit -m "feat(api): CRUD de gastos variaveis com item-espelho somente-leitura"

git add docs/sql docs/superpowers
git commit -m "docs: spec, plano e script SQL dos gastos variaveis"

git add web/src/features/gastos web/src/features/lancamentos web/src/app
git commit -m "feat(web): aba Gastos e cadeado na linha automatica de Lancamentos"
```

---

## Auto-revisão do plano

**Cobertura do spec:**

| Seção do spec | Task |
|---|---|
| §3.1 coluna `auto_source` | Task 1 |
| §3.2 tabela `variable_expenses` | Task 1 |
| §3.3 script SQL | Task 6 |
| §3.4 `schema.ts` | Task 1 Step 3 (à mão — desvio registrado) |
| §4.1 rotas | Task 4 Step 5 |
| §4.2 módulo | Tasks 2–4 |
| §4.3 `EntrySyncService` | Task 3 |
| §4.4 travas 422 | Task 5 |
| §4.5 contratos | Task 4 Steps 2–4 |
| §5.1 arquivos web | Tasks 7–8 |
| §5.2 `grouping.ts` | Task 7 |
| §5.3 tela | Task 8 |
| §5.4 hooks e invalidação | Task 7 Step 5 |
| §5.5 Lançamentos | Task 9 |
| §6 testes | Tasks 1–3, 4–5, 7–9 |
| §7 fora de escopo | nenhuma task — correto |

**Consistência de tipos:** `AUTO_SOURCE` exportado na Task 3 e consumido nas Tasks 4–5. `VariableExpense` (model, api) e `VariableExpense` (interface, web) são homônimos em camadas diferentes, sem import cruzado. `DayGroup` é tipo em `grouping.ts` e componente em `DayGroup.tsx` — importado com alias `type DayGroup as DayGroupData` na Task 8 Step 5.

**Desvio consciente do TDD:** nas Tasks 1–5 o teste é escrito antes da implementação, mas o ciclo *ver falhar → ver passar* não pode acontecer sem banco. Está registrado em cada Step de verificação. Nas Tasks 7–9 (web) o ciclo é completo e real.
