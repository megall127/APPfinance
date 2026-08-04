# Gastos Variáveis ("gastos da rua") — Documento de Design (Spec)

**Data:** 2026-08-04
**Status:** Aprovado (aguardando plano de implementação)
**Escopo:** API (`api/`) + Web (`web/`) — 1 tabela nova, 1 coluna nova em `items`, 4 rotas novas, 1 aba nova.
**Abordagem:** **Item-Espelho** — os gastos avulsos vivem numa tabela própria; o total do mês é *projetado* num `monthly_entry` de um item marcado como automático, que passa a ser somente-leitura em toda a aplicação.

---

## 1. Objetivo e decisões

Anotar, ao longo do mês, cada gasto do dia a dia — almoço, Uber, mercado, farmácia — que **não** é um gasto fixo cadastrado em Itens. O total desses lançamentos aparece em **Lançamentos** como uma linha só, com valor **calculado, nunca digitado**, e por consequência já entra no Dashboard, no Histórico e no gráfico anual.

### 1.1 As 5 escolhas do usuário (decididas, não questionadas)

| # | Pergunta | Decisão |
|---|---|---|
| 1 | Como o total aparece em Lançamentos? | **Linha de item automática** — item real no banco, valor calculado, travado. Dashboard/Histórico/anual passam a contar sozinhos. |
| 2 | Campos de cada gasto | **valor + descrição + data + categoria (opcional)**. Data já vem com hoje. |
| 3 | Status da linha automática | **Sempre paga** — o dinheiro já saiu; "Falta pagar" mostra só o que ainda vai sair. |
| 4 | Escopo da aba | **Só a lista e os totais** — total do mês, contagem, média, resumo por categoria, lista agrupada por dia. Sem limite/meta, sem comparativo entre meses. |
| 5 | Item vinculado | **Criado sozinho** no primeiro gasto, chamado `Gastos do mês`, sem categoria. Renomeável e categorizável na tela de Itens. |

Idioma da UI: **pt-BR**. Moeda: **BRL**.

### 1.2 As 7 decisões de arquitetura que carregam a feature

1. **O total é derivado, nunca digitado.** `monthly_entries.amount` do item automático é uma projeção de `SUM(variable_expenses.amount)` daquele mês. Não existe caminho no sistema em que o usuário escreva esse número.
2. **A marca é uma coluna, não uma convenção de nome.** `items.auto_source = 'variable_expenses'`, com índice único `(workspace_id, auto_source)`. Renomear o item para "Rolê" não quebra nada — a identidade é a coluna. O MySQL aceita múltiplos `NULL` num índice único, logo os itens normais não são afetados (mesmo truque de `reserve_movements.yield_period`).
3. **A trava mora na API, não na tela.** `POST /entries/upsert`, `PATCH /entries/:id` e `POST /entries/:id/toggle-paid` recusam (422) qualquer escrita em lançamento de item automático. O cadeado na UI é consequência, não a defesa.
4. **A soma é feita pelo MySQL, em `DECIMAL`.** `SUM(amount)` sobre coluna `DECIMAL(12,2)` é exato e o `mysql2` devolve string. Essa string vai direto para `monthly_entries.amount`. **Nenhum float participa do caminho de escrita** — diferente do `DashboardService`, que soma em float só para leitura.
5. **Total zero apaga a linha.** Se o mês ficou sem nenhum gasto (você apagou o último), o `monthly_entry` é removido em vez de virar `R$ 0,00` órfão em Lançamentos.
6. **Data é `DATE` puro e o mês nasce dela.** Nada de `year`/`month` denormalizados: `spent_on` é a única verdade. O front envia sempre `YYYY-MM-DD` — nunca ISO com hora — para que fuso horário não empurre um gasto de 31/07 23:00 para agosto.
7. **Editar a data ressincroniza os DOIS meses.** Mover um gasto de 31/07 para 01/08 recalcula julho *e* agosto na mesma transação. É o único caso em que uma escrita toca dois `monthly_entries`.

### 1.3 Regra de dinheiro no JSON (herdada do spec de Reservas)

> **Campo que vem DIRETO de uma coluna `decimal` → STRING** (`"32.50"`).
> **Campo AGREGADO ou derivado em JS → NÚMERO** (`487.6`).

Aplicada aqui: `expenses[].amount` é string; `total`, `average` e `byCategory[].total` são números.

---

## 2. Contexto atual

- **API:** AdonisJS + Lucid + MySQL. Módulos verticais em `api/app/modules/<nome>/` com `controller` + `service` + `validator`. `api/database/schema.ts` é **gerado** por `node ace migration:run` (nunca editado à mão). Escopo por workspace via middleware `currentWorkspace`; 404 nasce de `firstOrFail()` sobre query já escopada.
- **Lançamentos:** `EntryService.monthView` devolve todos os `items` com `is_active = true` pareados com o `monthly_entry` do mês (ou `null`). A grade agrupa por categoria no cliente.
- **Dashboard:** `DashboardService` soma `monthly_entries` juntando com `items.kind`. Como o item automático é `kind = 'expense'`, **nenhuma consulta do dashboard precisa mudar**.
- **Web:** React 19 + Vite + TS + TanStack Query v5 + Tailwind 4. Uma feature = um diretório com `use<Feature>.ts` + páginas + diálogos. `parseAmountInput` (em `features/lancamentos/math.ts`) já lê `32,50` e `1.234,56`.
- **Testes:** Japa 5 em `api/tests/{unit,functional}` com transação global por teste; Vitest + RTL co-locado no web.

---

## 3. Modelo de dados — DDL exata das migrations

Duas migrations novas, com timestamps fixados à mão **maiores** que `1782800000004_create_cdi_rates_table.ts`, garantindo a ordem `auto_source → variable_expenses`.

### 3.1 `1782900000001_add_auto_source_to_items.ts`

```ts
this.schema.alterTable('items', (table) => {
  // Marca o item gerado por uma feature automática. NULL = item normal do usuário.
  // Hoje só existe um valor possível: 'variable_expenses'.
  table.string('auto_source', 32).nullable()
  // Um item automático por fonte, por workspace. InnoDB permite vários NULLs
  // num índice único, então os itens do usuário não são afetados.
  table.unique(['workspace_id', 'auto_source'], { indexName: 'items_workspace_auto_source_unique' })
})
```

`down()`: remove o índice e a coluna.

### 3.2 `1782900000002_create_variable_expenses_table.ts`

```ts
this.schema.createTable('variable_expenses', (table) => {
  table.bigIncrements('id')
  table.bigInteger('workspace_id').unsigned()
    .references('id').inTable('workspaces').onDelete('CASCADE')
  table.bigInteger('category_id').unsigned().nullable()
    .references('id').inTable('categories').onDelete('SET NULL')

  // Data-caixa do gasto. É ela — e só ela — que define o mês de competência.
  table.date('spent_on').notNullable()
  table.decimal('amount', 12, 2).notNullable().defaultTo(0)
  table.string('description', 180).nullable()

  // Consulta quente: "todos os gastos do mês X deste workspace".
  table.index(['workspace_id', 'spent_on'], 'variable_expenses_ws_spent_on_index')
  // Resumo por categoria dentro do mês.
  table.index(['workspace_id', 'category_id'], 'variable_expenses_ws_category_index')

  table.timestamp('created_at').nullable()
  table.timestamp('updated_at').nullable()
})
```

### 3.3 Script SQL avulso (para rodar direto no phpMyAdmin)

Entregue em `docs/sql/2026-08-04-gastos-variaveis.sql`. Equivalente exato às duas migrations:

```sql
ALTER TABLE `items` ADD COLUMN `auto_source` VARCHAR(32) NULL AFTER `kind`;
CREATE UNIQUE INDEX `items_workspace_auto_source_unique` ON `items` (`workspace_id`, `auto_source`);

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 3.4 `api/database/schema.ts`

É um arquivo **gerado** por `node ace migration:run`, e versionado. As duas migrations precisam rodar contra um MySQL de verdade durante a implementação para que ele nasça com `ItemSchema.autoSource` e a classe `VariableExpenseSchema` — sem isso os models não compilam. Usar o banco de teste do `.env.test`; se nenhum MySQL estiver de pé na máquina, isso vira um bloqueio explícito a reportar, **não** um `schema.ts` editado à mão.

---

O script inclui, ao final, os `INSERT INTO adonis_schema` que marcam as duas migrations como já aplicadas — precedidos de um `SELECT` de conferência do formato das linhas existentes, porque rodar o DDL à mão **sem** esses inserts faz o próximo `node ace migration:run` tentar recriar tudo e falhar. Quem preferir rodar `node ace migration:run` normalmente deve **ignorar o arquivo inteiro**: os dois caminhos são alternativos, nunca cumulativos.

---

## 4. API

### 4.1 Rotas (grupo `[auth, currentWorkspace]` em `start/routes.ts`)

```
GET    /api/v1/variable-expenses?year=&month=   → resumo do mês + lista
POST   /api/v1/variable-expenses                → cria
PATCH  /api/v1/variable-expenses/:id            → edita
DELETE /api/v1/variable-expenses/:id            → apaga
```

Prefixo por extenso de propósito: `/expenses` colidiria semanticamente com `items?kind=expense`, que é outra coisa.

### 4.2 Módulo `api/app/modules/variable_expenses/`

| Arquivo | Responsabilidade |
|---|---|
| `variable_expenses_controller.ts` | HTTP: valida, delega, serializa |
| `variable_expense_service.ts` | CRUD escopado por workspace + resumo do mês |
| `entry_sync_service.ts` | **A única coisa que escreve o `monthly_entry` automático** |
| `variable_expense_validator.ts` | VineJS |

A separação importa: `EntrySyncService` é a fronteira. Ninguém mais no código escreve na linha automática, e o teste dele é independente do CRUD.

### 4.3 `EntrySyncService`

```ts
/** Recalcula a linha automática de UM mês. Idempotente. */
async syncMonth(workspaceId: number, year: number, month: number): Promise<void>
```

1. `SELECT SUM(amount) AS total FROM variable_expenses WHERE workspace_id = ? AND spent_on BETWEEN ? AND ?` — limites vindos de `monthRange(year, month)`, função pura.
2. Se `total` é `NULL` ou `0.00`: procura o item automático; se **não** existir, retorna sem fazer nada (mês vazio de workspace novo não cria item à toa); se existir, apaga o `monthly_entry` daquele item/ano/mês.
3. Senão, `ensureAutoItem(workspaceId)`:
   - `Item.firstOrCreate({ workspaceId, autoSource: 'variable_expenses' }, { name: 'Gastos do mês', kind: 'expense', categoryId: null, isActive: true, sortOrder: 999 })`
   - se o item já existe mas está `is_active = false`, **reativa** — auto-cura o caso "desativei sem querer e os gastos sumiram da tela".
4. `MonthlyEntry.updateOrCreate({ itemId, year, month }, { workspaceId, amount: total, status: 'paid', paidAt: existente?.paidAt ?? DateTime.now() })`.
   - `amount` recebe a **string** vinda do `SUM` — sem passar por `Number`.
   - `paidAt` preservado quando já existia, para não reescrever a data toda vez que um gasto novo é anotado.

**Não** passa por `EntryService.upsert`: o item automático nunca é parcelado, então o efeito colateral de `applyInstallmentDelta` seria ruído.

`onDeleteMonthChange(oldDate, newDate)` chama `syncMonth` para os dois meses quando ano/mês mudaram; para os demais casos, um `syncMonth` só.

### 4.4 Trava do item automático (422, não 404)

Exceção nova `AutoItemReadOnlyException` (status 422, code `E_AUTO_ITEM_READONLY`), lançada em:

| Onde | Condição | Mensagem |
|---|---|---|
| `EntryService.upsert` | `item.autoSource != null` | "O valor de 'Gastos do mês' é calculado pela aba Gastos e não pode ser editado aqui." |
| `EntryService.update` | entry pertence a item automático | idem |
| `EntryService.togglePaid` | idem | "Gastos já lançados contam sempre como pagos." |
| `ItemService.update` | `item.autoSource != null` **e** `dto.kind` difere do atual | "Não dá para mudar o tipo do item de gastos." |
| `ItemService.deactivateOrDelete` | `item.autoSource != null` | "Esse item é gerado pela aba Gastos. Apague os gastos do mês para zerá-lo." |

`ItemService.update` continua aceitando `name`, `categoryId`, `sortOrder` no item automático — é exatamente o que a decisão #5 do usuário pede.

`updateItemValidator` e `createItemValidator` **não** ganham `autoSource`: a coluna nunca é definida por request.

### 4.5 Contratos

**`GET /api/v1/variable-expenses?year=2026&month=8`** → 200

```json
{
  "total": 487.6,
  "count": 12,
  "average": 40.63,
  "byCategory": [
    { "categoryId": 3, "name": "Alimentação", "color": "#ef4444", "total": 210.4 },
    { "categoryId": null, "name": null, "color": null, "total": 134.0 }
  ],
  "expenses": [
    { "id": "31", "amount": "32.50", "description": "Almoço", "spentOn": "2026-08-04", "categoryId": "3" }
  ]
}
```

`expenses` vem ordenado por `spent_on DESC, id DESC`. **A lista é plana** — agrupar por dia e rotular "Hoje"/"Ontem" é apresentação, e mora no cliente, onde o fuso do usuário é conhecido. `average = total / count` (0 quando `count` é 0).

**`POST /api/v1/variable-expenses`** → 201 com o gasto serializado

```json
{ "amount": 32.5, "spentOn": "2026-08-04", "description": "Almoço", "categoryId": 3 }
```

- `amount`: número, `> 0`
- `spentOn`: string `YYYY-MM-DD` (regex no validator — recusa ISO com hora)
- `description`: opcional, ≤ 180
- `categoryId`: opcional; conferido contra o workspace no service (404 se for de outro)

**`PATCH /api/v1/variable-expenses/:id`** → 200. Todos os campos opcionais. `categoryId: null` limpa a categoria.

**`DELETE /api/v1/variable-expenses/:id`** → 200 `{ "deleted": true }`. Delete de verdade — um gasto anotado errado não tem por que virar histórico.

Toda escrita chama `syncMonth` **antes** de responder, para que o `invalidateQueries` do cliente leia o número já correto.

---

## 5. Web

### 5.1 Arquivos

```
web/src/features/gastos/
  GastosPage.tsx           página + cabeçalho de totais
  GastosPage.test.tsx
  ExpenseFormDialog.tsx    criar e editar (mesmo diálogo)
  ExpenseFormDialog.test.tsx
  DayGroup.tsx             cabeçalho do dia + linhas
  ExpenseRow.tsx           uma linha de gasto
  CategorySummary.tsx      chips coloridos por categoria
  useVariableExpenses.ts   queries + mutations
  grouping.ts              agrupar por dia, rótulo do dia
  grouping.test.ts
```

Rota `/gastos` em `app/router.tsx`; item de nav **"Gastos"** com ícone `Receipt` (lucide), logo depois de "Lançamentos" em `AppLayout.tsx`.

### 5.2 `grouping.ts` — lógica pura, testada isolada

```ts
groupByDay(expenses: Expense[]): DayGroup[]   // [{ date, total, expenses }], dia mais recente primeiro
dayLabel(isoDate: string, today: Date): string // 'Hoje' | 'Ontem' | 'seg, 02/08'
```

`total` do dia soma em **centavos inteiros** (`Math.round(Number(a) * 100)`) e divide por 100 no fim — é o único lugar do web que soma dinheiro repetidamente, e `0.1 + 0.2` não vai aparecer na tela do usuário.

### 5.3 Tela

Cabeçalho com `MonthYearPicker` (reaproveitado de `features/dashboard`), total grande, `N gastos · média R$ X`, chips por categoria, e a lista agrupada por dia. Botão "+ Novo gasto" fixo no canto inferior direito no mobile (`fixed bottom-6 right-6`), inline no topo do card no desktop.

Estados: skeleton no carregamento, mensagem de erro, e vazio — *"Nenhum gasto anotado em Agosto. Toque em + para anotar o primeiro."*

Tocar numa linha abre o `ExpenseFormDialog` em modo edição, com botão excluir. O diálogo tem: valor (`inputMode="decimal"`, lido por `parseAmountInput`), descrição, data (`<input type="date">`, default hoje) e categoria (`Select` das categorias existentes + opção "Sem categoria").

### 5.4 `useVariableExpenses.ts`

Chave: `['variable-expenses', year, month]`.

Mutations com atualização otimista sobre essa chave (mesmo padrão de `useEntries`: `onMutate` guarda `previous`, `onError` restaura, `onSettled` invalida). Em `onSuccess`, invalida também:

```
['entries', year, month]   ['dashboard']   ['dashboard-yearly']   ['items']
```

**Quando a edição muda o mês do gasto**, invalida os pares `(ano, mês)` **antigo e novo** de `variable-expenses` e de `entries` — senão a tela de Lançamentos do mês antigo fica mostrando um total defasado até um F5.

### 5.5 Lançamentos

`EntryRow` recebe o item já com `autoSource`. Quando presente:
- `EditableAmount` vira texto puro com ícone de cadeado e `title="Calculado pela aba Gastos"`
- `StatusToggle` fica desabilitado, exibindo "Pago" estático
- um link discreto "ver gastos" navega para `/gastos` no mesmo mês

`EntryItem` em `useEntries.ts` ganha `autoSource?: string | null`. Nada muda no `EntriesController`: ele já responde `item.serialize()`, e o Lucid serializa a coluna nova assim que ela existe em `schema.ts`. `computeMonthSummary` **não muda** — a linha automática já é um `expense` com entry `paid`, e a matemática atual a trata certo.

---

## 6. Testes

### 6.1 `api/tests/functional/variable_expenses.spec.ts`

| # | Caso | Espera |
|---|---|---|
| 1 | POST do primeiro gasto | 201; item `auto_source='variable_expenses'` criado; `monthly_entry` com o valor, `status='paid'` |
| 2 | POST de um segundo gasto no mesmo mês | entry passa a ser a soma dos dois |
| 3 | PATCH mudando o valor | entry reflete o novo total |
| 4 | PATCH movendo de 31/07 para 01/08 | entry de julho diminui (ou some); entry de agosto é criado |
| 5 | DELETE do último gasto do mês | `monthly_entry` **removido**, não zerado |
| 6 | GET do mês | `total`, `count`, `average`, `byCategory` (com o balde `categoryId: null`) corretos |
| 7 | GET de mês vazio | `total: 0`, `count: 0`, `expenses: []`, sem criar item |
| 8 | POST com `categoryId` de outro workspace | 404 |
| 9 | PATCH/DELETE de id de outro workspace | 404 |
| 10 | `POST /entries/upsert` no item automático | 422 |
| 11 | `PATCH /entries/:id` do entry automático | 422 |
| 12 | `POST /entries/:id/toggle-paid` do entry automático | 422 |
| 13 | `DELETE /items/:id` do item automático | 422 |
| 14 | `PATCH /items/:id` mudando `kind` | 422 |
| 15 | `PATCH /items/:id` mudando `name` e `categoryId` | 200 — renomear é permitido |
| 16 | Item automático desativado + novo gasto | item volta a `is_active = true` |
| 17 | `GET /dashboard` após lançar gastos | `totalDoMes` e `jaPago` incluem o total |

### 6.2 `api/tests/unit/variable_expense_sync.spec.ts`

`monthRange(2026, 2)` → `['2026-02-01', '2026-02-28']`; ano bissexto → `2024-02-29`; dezembro não vaza para o ano seguinte. `toAmountString` normaliza `null`, `"487.60"` e `487.6`.

### 6.3 Web

- `grouping.test.ts` — agrupamento e ordenação; `dayLabel` para hoje, ontem e data antiga; virada de mês
- `GastosPage.test.tsx` — renderiza total, chips e grupos; estado vazio
- `ExpenseFormDialog.test.tsx` — aceita `32,50` e `1.234,56`; recusa valor vazio/zero; data default é hoje

---

## 7. O que está fora de escopo (decidido, não esquecido)

- **Limite/meta de gastos do mês** e barra de progresso — decisão #4. Cabe depois numa coluna só, sem retrabalho.
- **Comparativo entre meses** e gráfico de barras — decisão #4.
- **Forma de pagamento** (Pix/débito/crédito/dinheiro) — decisão #2.
- **Painel novo no dashboard** — desnecessário: o total já entra no "Total do mês" pela linha automática.
- **Recorrência / gasto parcelado** — isso é o que a tela de Itens já faz.
- **Anexar foto do comprovante** — nada no app hoje lida com upload de arquivo além do importador de planilha.
