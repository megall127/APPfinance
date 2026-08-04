# Dinheiro Guardado + Rendimento — Documento de Design (Spec)

**Data:** 2026-07-21
**Status:** Aprovado (aguardando plano de implementação)
**Escopo:** API (`api/`) + Web (`web/`) — 4 tabelas novas, 14 rotas novas, 1 painel novo no carrossel do dashboard.
**Abordagem:** **Caixinhas-Razão** — o saldo é sempre `SUM(amount)`; o rendimento é um lançamento datado, nunca um cálculo em tempo de leitura persistido.

---

## 1. Objetivo e decisões

Dar à família uma visão fiel do **dinheiro guardado** e de **quanto ele rende**, com o mesmo vocabulário mensal que o resto do Lefinance já usa.

### 1.1 As 4 escolhas do usuário (decididas, não questionadas)

| # | Requisito | Como é atendido |
|---|---|---|
| 1 | Várias contas/caixinhas de reserva (nome, instituição, saldo, taxa própria) + total consolidado | `reserve_accounts` + `reserve_rate_periods` (taxa por vigência); saldo **derivado** de `SUM(reserve_movements.amount)`; total em `GET /reserves/summary` |
| 2 | Rendimento por taxa configurada + juros compostos (% a.m. / % a.a. / % do CDI), mês a mês sobre saldo + aportes | `interest.ts` (§5) + apuração mensal materializada como movimento `kind='yield'` datado no último dia do mês → a **capitalização é emergente**, não programada |
| 3 | Movimentações: depósitos e saques datados com histórico; saldo derivado das movimentações + rendimentos | `reserve_movements` com `amount` **assinado**; extrato com saldo corrente; **não existe coluna de saldo em lugar nenhum** |
| 4a | Meta por conta (valor-alvo + progresso) | `goal_amount` / `goal_date` / `goal_monthly_contribution` + `metaProgresso` + ETA calculado pela **mesma recorrência** do simulador |
| 4b | Painel "Guardado" no carrossel do dashboard | `GuardadoPanel` como 5º `<CarouselItem>` |
| 4c | Simulador de projeção (aporte X, taxa Y, Z meses → gráfico) | `ProjectionSimulator` + `ProjectionChart`, 100% client-side |

Idioma da UI: **pt-BR**. Moeda: **BRL**.

### 1.2 As 8 decisões de arquitetura que carregam a feature

1. **Saldo é `SUM()`, nunca coluna.** `saldo(D) = SUM(amount) WHERE occurred_on <= D`. Impossível o saldo divergir dos lançamentos.
2. **`amount` é assinado.** `deposit`/`opening`/`yield` > 0, `withdrawal` < 0, `adjustment` livre. Extrato = um `ORDER BY (occurred_on, id)` acumulando. Zero `CASE WHEN kind` em SQL ou JS.
3. **Juros compostos são emergentes.** O rendimento de M é gravado no **último dia de M**, logo entra no saldo inicial de M+1 com peso 1. Nenhuma linha de código "capitaliza".
4. **Aritmética em CENTAVOS INTEIROS.** Dinheiro nunca é somado em float. Um único `Math.round` por rendimento (§5.4).
5. **Taxa é histórico versionado** (`reserve_rate_periods`), não estado da conta. Trocar de 100% para 110% do CDI em agosto não reescreve julho.
6. **CDI é ANUAL e esparso** (`cdi_rates`), e "% do CDI" incide sobre a **taxa diária** de 252 dias úteis — a convenção real de CDB/LCI (§5.2). O usuário digita **1 número por ano** ("CDI a 14,90% a.a."), não 12.
7. **Reapuração é sempre total e idempotente.** `POST /reserves/yield/close` reprocessa da abertura da conta até o mês-alvo, sempre. **Não existe dirty-tracking** — logo não existe a classe de bug "esqueci de marcar sujo". `last_closed_period` (um único escritor) diz até onde já foi apurado.
8. **Rendimento do mês corrente é CALCULADO em leitura, nunca materializado** (§5.6). O painel "Guardado" mostra `rendimentoParcialDoMes` rotulado *parcial* desde o dia 1 — nunca R$ 0,00 esperando o mês virar.

### 1.3 Regra de dinheiro no JSON (declarada uma vez, aplicada em todo o módulo)

> **Campo que vem DIRETO de uma coluna `decimal` → STRING** (`"12693.55"`, como `/items` e `/entries`).
> **Campo AGREGADO ou derivado em JS → NÚMERO** (como `/dashboard`).

Essa regra já é a verdade de fato no repositório; aqui ela é escrita, documentada no docblock de cada controller e refletida nos tipos do web.

---

## 2. Contexto atual

- **API:** AdonisJS 7 + Lucid 22 + MySQL. Módulos verticais em `api/app/modules/<plural>/`. `api/database/schema.ts` é **gerado** por `node ace migration:run` (nunca editado à mão) e versionado. Escopo por workspace via `currentWorkspace` middleware; 404 nasce de `firstOrFail()` sobre query já escopada.
- **Web:** React 19 + Vite + TS + TanStack Query v5 + Tailwind 4 (CSS-first, light-only) + Recharts 3. Uma feature = um diretório com `use<Feature>.ts` + páginas + diálogos.
- **Dashboard:** `<Carousel gridClassName="lg:grid-cols-2">` com **4** `<CarouselItem>`; a contagem de dots vem de `Children.count(children)`.
- **Precisão:** não existe biblioteca decimal. Hoje o `DashboardService` soma em float. **Este módulo diverge conscientemente** e soma em centavos inteiros — rendimento é o único lugar do app onde o erro acumula mês após mês.
- **Testes:** Japa 5 (`api/tests/{unit,functional}/**/*.spec.ts`) com transação global por teste; Vitest + RTL co-locado no web, sem `QueryClientProvider`.

---

## 3. Modelo de dados — DDL exata das migrations

Quatro migrations novas, com timestamps **fixados à mão** (maiores que `1782700000000_add_installments_to_items.ts`) para garantir a ordem `accounts → rate_periods → movements → cdi`.

### 3.1 `1782800000001_create_reserve_accounts_table.ts`

```ts
import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'reserve_accounts'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id')
      table
        .bigInteger('workspace_id')
        .unsigned()
        .references('id')
        .inTable('workspaces')
        .onDelete('CASCADE')

      table.string('name', 120).notNullable()
      table.string('institution', 120).nullable()
      table.string('color', 7).nullable()

      // Âncora do PRIMEIRO mês de apuração. Nenhum yield existe antes dela.
      table.date('opened_at').notNullable()

      table.decimal('goal_amount', 12, 2).nullable()
      table.date('goal_date').nullable()
      // Aporte mensal PLANEJADO — alimenta o ETA da meta sem chutar um valor.
      table.decimal('goal_monthly_contribution', 12, 2).nullable()

      table.integer('sort_order').notNullable().defaultTo(0)
      table.boolean('archived').notNullable().defaultTo(false)

      // 'YYYY-MM' do último mês JÁ APURADO. Único escritor: ReserveYieldService.
      // Existe porque meses com base zero / rendimento < R$ 0,01 não geram linha
      // de yield — sem esta coluna o banner "apuração pendente" nunca convergiria.
      table.string('last_closed_period', 7).nullable()

      table.index(['workspace_id', 'sort_order'])
      table.index(['workspace_id', 'archived'])

      table.timestamp('created_at').nullable()
      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
```

> **NÃO existe** coluna de saldo, de taxa, de rendimento acumulado nem de `dirty_from_*`. Tudo derivado.

### 3.2 `1782800000002_create_reserve_rate_periods_table.ts`

```ts
import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'reserve_rate_periods'

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
        .bigInteger('reserve_account_id')
        .unsigned()
        .references('id')
        .inTable('reserve_accounts')
        .onDelete('CASCADE')

      table.integer('effective_year').notNullable()
      table.integer('effective_month').notNullable() // 1..12

      table.enum('rate_kind', ['monthly', 'yearly', 'cdi']).notNullable()
      // PERCENTUAL, nunca fração:
      //   0.850000 = 0,85% a.m. | 12.500000 = 12,5% a.a. | 102.000000 = 102% do CDI
      table.decimal('rate_value', 9, 6).notNullable()

      table.unique(['reserve_account_id', 'effective_year', 'effective_month'])
      table.index(['workspace_id', 'reserve_account_id', 'effective_year', 'effective_month'])

      table.timestamp('created_at').nullable()
      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
```

> É a **única fonte de verdade da taxa** e é imutável como histórico. Como a apuração sempre reprocessa da abertura lendo daqui, reprocessar é uma **função pura de (movimentos, vigências, CDI)** → ponto fixo garantido.

### 3.3 `1782800000003_create_reserve_movements_table.ts`

```ts
import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'reserve_movements'

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
        .bigInteger('reserve_account_id')
        .unsigned()
        .references('id')
        .inTable('reserve_accounts')
        .onDelete('CASCADE')

      // opening    = saldo que JÁ existia no banco ao cadastrar (capital, não aporte)
      // deposit    = aporte
      // withdrawal = saque
      // adjustment = acerto com o extrato do banco (delta assinado; conta como RENDIMENTO)
      // yield      = rendimento apurado (só o YieldService cria)
      table
        .enum('kind', ['opening', 'deposit', 'withdrawal', 'adjustment', 'yield'])
        .notNullable()

      // Data-caixa. Para kind='yield' é SEMPRE o último dia do mês de competência.
      table.date('occurred_on').notNullable()

      // VALOR ASSINADO: SUM(amount) = saldo, sem CASE WHEN.
      table.decimal('amount', 12, 2).notNullable().defaultTo(0)
      table.string('description', 180).nullable()

      // ── Memória de cálculo, congelada na linha (auditoria humana) ──────────
      table.string('yield_period', 7).nullable() // 'YYYY-MM'; NOT NULL só quando kind='yield'
      table.decimal('yield_base', 14, 6).nullable() // base ponderada EXATA (6 casas!)
      table.decimal('yield_rate_applied', 12, 10).nullable() // taxa efetiva em FRAÇÃO
      table.enum('yield_rate_kind', ['monthly', 'yearly', 'cdi']).nullable()
      table.decimal('yield_rate_source', 9, 6).nullable() // valor bruto da vigência (102.000000)
      table.decimal('yield_cdi_annual', 9, 6).nullable() // CDI a.a. usado (14.900000); null se != cdi

      // Idempotência da apuração garantida pelo BANCO, não por código.
      // NOTA: yield_period é NULLABLE e o InnoDB permite múltiplos NULLs num índice
      // único — logo depósitos/saques (yield_period = NULL) se repetem à vontade,
      // enquanto o rendimento de um mês é fisicamente único por conta.
      table.unique(['reserve_account_id', 'yield_period'])

      table.index(['reserve_account_id', 'occurred_on', 'id'])
      table.index(['workspace_id', 'occurred_on'])
      table.index(['workspace_id', 'kind', 'occurred_on'])

      table.timestamp('created_at').nullable()
      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
```

**Por que `yield_base` é `decimal(14,6)` e não `(12,2)`:** a base ponderada é intrinsecamente uma dízima (V4: `2548,387097`). Se o extrato imprime "base × taxa" e a base foi truncada em 2 casas, o usuário que refizer a conta na calculadora acha um centavo diferente do creditado numa fração dos meses. Numa feature cuja tese é auditabilidade por linha, a coluna de auditoria precisa ser reprodutível.

### 3.4 `1782800000004_create_cdi_rates_table.ts`

```ts
import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'cdi_rates'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id')
      table
        .bigInteger('workspace_id')
        .unsigned()
        .references('id')
        .inTable('workspaces')
        .onDelete('CASCADE')

      table.integer('year').notNullable()
      table.integer('month').notNullable() // 1..12 — mês a partir do qual a taxa vale

      // CDI ANUAL em percentual: 14.900000 = 14,90% ao ano.
      table.decimal('annual_rate', 9, 6).notNullable()

      table.unique(['workspace_id', 'year', 'month'])
      table.index(['workspace_id', 'year', 'month'])

      table.timestamp('created_at').nullable()
      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
```

**Por que ANUAL e esparso:** "o CDI está em 14,90% ao ano" é o número que está em toda notícia e em todo app de banco. O CDI *mensal* exigiria 12 digitações por ano; o anual muda ~4× por ano (a cada reunião do Copom). Tabela esparsa + **carry-forward** por `(year*12+month)`: a linha de jan/2026 vale para fev, mar… até aparecer uma linha nova. Sem nenhuma linha, cai em `DEFAULT_CDI_ANNUAL = 14.90` (`api/app/modules/reserves/cdi_defaults.ts`, mesmo padrão de `default_categories.ts`) e a resposta marca `cdiSource: 'default'`.

**Escopo por workspace** (não é tabela global) porque o repo não tem nenhuma tabela sem `workspace_id` nem área de admin, e o `currentWorkspace` é a única porta de entrada.

> **Sem seeder.** `WorkspaceService.provisionForUser` **não** é alterado (o unit test que assevera 6 categorias fica intacto). O fallback constante cobre workspaces sem linha.

### 3.5 Models (`api/app/models/*.ts`) — só relações

```ts
// api/app/models/reserve_account.ts
import { ReserveAccountSchema } from '#database/schema'
import { belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import Workspace from '#models/workspace'
import ReserveMovement from '#models/reserve_movement'
import ReserveRatePeriod from '#models/reserve_rate_period'

export default class ReserveAccount extends ReserveAccountSchema {
  @belongsTo(() => Workspace)
  declare workspace: BelongsTo<typeof Workspace>

  @hasMany(() => ReserveMovement)
  declare movements: HasMany<typeof ReserveMovement>

  @hasMany(() => ReserveRatePeriod)
  declare ratePeriods: HasMany<typeof ReserveRatePeriod>
}
```

`reserve_movement.ts` e `reserve_rate_period.ts`: `@belongsTo(() => Workspace)` + `@belongsTo(() => ReserveAccount)`.
`cdi_rate.ts`: `@belongsTo(() => Workspace)`.

---

## 4. `api/database/schema.ts` — conteúdo gerado

> ⚠️ **Este arquivo NÃO é editado à mão.** O cabeçalho diz `DO NOT EDIT manually`. O conteúdo abaixo é o que o gerador **deve produzir** ao rodar `npm --prefix api run ace -- migration:run`, e serve como **critério de conferência**: se o arquivo sair diferente disto, a migration é que está errada. As 4 classes são **acrescentadas ao FIM** do arquivo (a ordem das classes segue a ordem das tabelas no banco, não é alfabética); colunas **em ordem alfabética pelo nome snake_case**, emitidas em camelCase.

```ts
export class ReserveAccountSchema extends BaseModel {
  static $columns = ['archived', 'color', 'createdAt', 'goalAmount', 'goalDate', 'goalMonthlyContribution', 'id', 'institution', 'lastClosedPeriod', 'name', 'openedAt', 'sortOrder', 'updatedAt', 'workspaceId'] as const
  $columns = ReserveAccountSchema.$columns
  @column()
  declare archived: boolean
  @column()
  declare color: string | null
  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime | null
  @column()
  declare goalAmount: string | null
  @column.date()
  declare goalDate: DateTime | null
  @column()
  declare goalMonthlyContribution: string | null
  @column({ isPrimary: true })
  declare id: bigint | number
  @column()
  declare institution: string | null
  @column()
  declare lastClosedPeriod: string | null
  @column()
  declare name: string
  @column.date()
  declare openedAt: DateTime
  @column()
  declare sortOrder: number
  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null
  @column()
  declare workspaceId: bigint | number | null
}

export class ReserveRatePeriodSchema extends BaseModel {
  static $columns = ['createdAt', 'effectiveMonth', 'effectiveYear', 'id', 'rateKind', 'rateValue', 'reserveAccountId', 'updatedAt', 'workspaceId'] as const
  $columns = ReserveRatePeriodSchema.$columns
  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime | null
  @column()
  declare effectiveMonth: number
  @column()
  declare effectiveYear: number
  @column({ isPrimary: true })
  declare id: bigint | number
  @column()
  declare rateKind: string
  @column()
  declare rateValue: string
  @column()
  declare reserveAccountId: bigint | number | null
  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null
  @column()
  declare workspaceId: bigint | number | null
}

export class ReserveMovementSchema extends BaseModel {
  static $columns = ['amount', 'createdAt', 'description', 'id', 'kind', 'occurredOn', 'reserveAccountId', 'updatedAt', 'workspaceId', 'yieldBase', 'yieldCdiAnnual', 'yieldPeriod', 'yieldRateApplied', 'yieldRateKind', 'yieldRateSource'] as const
  $columns = ReserveMovementSchema.$columns
  @column()
  declare amount: string
  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime | null
  @column()
  declare description: string | null
  @column({ isPrimary: true })
  declare id: bigint | number
  @column()
  declare kind: string
  @column.date()
  declare occurredOn: DateTime
  @column()
  declare reserveAccountId: bigint | number | null
  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null
  @column()
  declare workspaceId: bigint | number | null
  @column()
  declare yieldBase: string | null
  @column()
  declare yieldCdiAnnual: string | null
  @column()
  declare yieldPeriod: string | null
  @column()
  declare yieldRateApplied: string | null
  @column()
  declare yieldRateKind: string | null
  @column()
  declare yieldRateSource: string | null
}

export class CdiRateSchema extends BaseModel {
  static $columns = ['annualRate', 'createdAt', 'id', 'month', 'updatedAt', 'workspaceId', 'year'] as const
  $columns = CdiRateSchema.$columns
  @column()
  declare annualRate: string
  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime | null
  @column({ isPrimary: true })
  declare id: bigint | number
  @column()
  declare month: number
  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null
  @column()
  declare workspaceId: bigint | number | null
  @column()
  declare year: number
}
```

**Consequências obrigatórias desse mapeamento** (verificadas em `@adonisjs/lucid/build/src/orm/schema_generator/rules.js`):

- `decimal` → `string`. **Todo** valor monetário e toda taxa chegam como string do banco: `Number(...)` em toda fronteira, `toFixed()` na gravação.
- `enum` → `string` (sem união literal). `kind`, `rateKind` etc. precisam de cast explícito no service quando forem estreitados.
- `date` → `DateTime` com `@column.date()` → serializa como `'YYYY-MM-DD'`. **Nunca** construir datas com `new Date()`: sempre `DateTime.fromISO('2026-07-05')` ou `DateTime.fromObject({ year, month, day })`. Um `new Date('2026-07-01')` em UTC-3 vira 30/06 e joga o movimento no mês errado.
- `bigIncrements` → `bigint | number` → `Number(...)` em **toda** comparação de id.
- FK sem `.notNullable()` → tipo anulável → `Number(x ?? 0)` / `?? null` nos services.

---

## 5. Matemática do rendimento

Módulo puro, sem I/O, **espelhado byte-a-byte** em:

- `api/app/modules/reserves/interest.ts`
- `web/src/features/reservas/interest.ts`

Cabeçalho obrigatório nos dois arquivos:
```
ESPELHO de <o outro caminho>. Qualquer mudança aqui exige a MESMA mudança lá.
Os vetores dourados V1..V10 (§5.9 do spec) estão duplicados nos dois testes.
```

### 5.0 Unidades — a fonte #1 de erro nesta feature

| Grandeza | Unidade | Exemplo |
|---|---|---|
| `rateValue`, `annualRate`, `yieldRateSource`, `yieldCdiAnnual` | **PERCENTUAL** | `0.85`, `12.5`, `102`, `14.9` |
| `i`, `taxaMensalEfetiva`, `yieldRateApplied` | **FRAÇÃO 0..1** | `0.0118757178` |
| Dinheiro dentro do motor | **CENTAVOS INTEIROS** | `1269355` |
| Dinheiro no banco/JSON | reais, 2 casas | `"12693.55"` |

Confundir percentual com fração é um erro de fator 100 no rendimento. Nomes são explícitos e há teste dedicado (V11).

### 5.1 Conversões de fronteira

```ts
export function toCents(v: string | number): number {
  return Math.round(Number(v) * 100)
}
export function fromCents(c: number): string {
  return (c / 100).toFixed(2)
}
```

Faixa segura: `Number.MAX_SAFE_INTEGER = 9_007_199_254_740_991` centavos ≈ R$ 90 trilhões, e `decimal(12,2)` satura antes disso (R$ 9.999.999.999,99). Aritmética de centavos é exata em toda a faixa útil.

### 5.2 Taxa efetiva mensal `i` (fração)

```ts
const BUSINESS_DAYS_YEAR = 252
const BUSINESS_DAYS_MONTH = 21 // 252/12 EXATO — é o que torna a propriedade abaixo verdadeira

/**
 * @param kind      'monthly' | 'yearly' | 'cdi'
 * @param value     PERCENTUAL da vigência (0.85 | 12.5 | 102)
 * @param cdiAnnual PERCENTUAL do CDI ANUAL do mês (14.9) — obrigatório só quando kind='cdi'
 * @returns fração 0..1, ou null quando kind='cdi' e não há CDI resolvível
 */
export function effectiveMonthlyRate(
  kind: 'monthly' | 'yearly' | 'cdi',
  value: number,
  cdiAnnual?: number | null
): number | null {
  const v = Number.isFinite(value) && value > 0 ? value : 0
  switch (kind) {
    case 'monthly':
      return v / 100
    case 'yearly':
      return Math.pow(1 + v / 100, 1 / 12) - 1
    case 'cdi': {
      if (cdiAnnual == null || !Number.isFinite(cdiAnnual)) return null
      const tdi = Math.pow(1 + cdiAnnual / 100, 1 / BUSINESS_DAYS_YEAR) - 1
      const daily = tdi * (v / 100)
      return Math.pow(1 + daily, BUSINESS_DAYS_MONTH) - 1
    }
  }
}

export function annualEquivalent(i: number): number {
  return Math.pow(1 + i, 12) - 1
}
```

**`yearly` usa taxa EQUIVALENTE, jamais `v/12`.**
`v = 10` → `i = 0,007974140429` (0,7974% a.m.). Conferido: `(1+i)^12 − 1 = 0,100000000000` exato.
O proporcional `10/12 = 0,833%` capitalizado 12× daria **10,4713% a.a.** — o app estaria mentindo 47 pontos-base por ano. A UI mostra a conversão embaixo do campo justamente para o usuário conferir.

**`cdi` incide sobre a taxa DIÁRIA (convenção B3/CETIP real de CDB/LCI/LCA).**
Com CDI = 14,90% a.a.: `tdi = 1,149^(1/252) − 1 = 0,000551310642`.

| % do CDI | `i` (a.m.) | equivalente a.a. |
|---|---|---|
| 100% | `0,0116415750` (1,164158%) | **14,900000%** |
| 102% | `0,0118757178` (1,187572%) | 15,219528% |
| 110% | `0,0128128053` (1,281281%) | 16,506513% |
| 120% | `0,0139853269` (1,398533%) | 18,135397% |

**Propriedade de validação (teste obrigatório):** como `21 × 12 = 252` exato, 100% do CDI recomposto devolve **exatamente** o CDI anual — erro absoluto medido `7,97e-15`. É essa igualdade que justifica 21 dias/mês em vez de 30/360, e é o oráculo mais forte do módulo.

> **Não há teto de 100%** no validador. `110% do CDI` é o produto mais comum do país; `rateValue` aceita `0..1000`.

### 5.3 Base de cálculo — pro-rata por dias corridos

Para a conta A no mês de competência M:

```
D  = dias reais do mês M (28 | 29 | 30 | 31) — DateTime.daysInMonth
S₀ = Σ amount de TODOS os movimentos com occurred_on < dia 1 de M
     (inclui os yields dos meses anteriores → COMPOSIÇÃO AUTOMÁTICA)
K  = movimentos com occurred_on DENTRO de M, EXCLUINDO qualquer kind='yield' de M
     cada um com dia d_k ∈ [1..D] e valor assinado m_k (em centavos)

peso(d) = (D − d + 1) / D
B       = S₀ + Σ_k [ m_k × peso(d_k) ]        ← centavos, FRACIONÁRIO, nunca arredondado
se B < 0 → B = 0                              ← saldo negativo não gera rendimento nem "juros de dívida"
```

#### Convenção de contagem de dias — declarada explicitamente

`peso(d) = (D − d + 1)/D` significa: **o dinheiro lançado no dia `d` esteve na conta nos dias `d..D`, ou seja `D − d + 1` dias de `D`.**

Três invariantes que essa escolha garante (todos testados em V6):

1. **`S₀` ≡ depósito no dia 1.** `S₀` esteve presente os `D` dias → peso 1. Um depósito no dia 1 também → `peso(1) = D/D = 1`. São a mesma situação física (dinheiro presente desde a virada do mês) e produzem a mesma base. Conferido: ambas as bases dão exatamente `1000000,000000` centavos.
2. **Depósito e saque no mesmo dia se cancelam exatamente** (`+X·w − X·w = 0`), sem resíduo.
3. **Saque no dia `d` perde `(D − d + 1)/D`**, ou seja mantém `(d − 1)/D` — simétrico à entrada.

*Alternativa avaliada e rejeitada:* `(D − d)/D` (depósito no dia 1 rende `(D−1)/D`, depósito no último dia rende 0). Ela quebra o invariante 1 — o mesmo dinheiro renderia diferente conforme fosse "saldo trazido" ou "depósito do dia 1º" — e obrigaria a tratar `S₀` como um caso especial fora da fórmula. A diferença entre as duas convenções é de **um dia por movimento** (~0,04% do valor movimentado ao mês).

**Por que pro-rata e não saldo inicial nem saldo final:**

- *Saldo inicial puro* pune o aporte: quem deposita R$ 1.500 no dia 15 a 1,1876% a.m. recebe **R$ 0,00** naquele mês em vez de **R$ 9,77** — ~**R$ 117,22 por ano** de subestimação sistemática para quem aporta todo mês. O usuário deixa de confiar no app.
- *Saldo final* premia demais: depositar no dia 30 renderia o mês inteiro — dinheiro inventado.
- Pro-rata linear cabe numa fórmula que o extrato consegue **imprimir** ("R$ 1.500,00 a partir do dia 5 → 27/31 do mês") e que o usuário confere com regra de três.

**Divergência honesta contra o extrato do banco:** um CDB/caixinha real capitaliza em **dias úteis** com calendário ANBIMA. A ponderação linear por dias corridos difere disso em fração de real por mês numa reserva familiar. O app **não promete bater centavo a centavo com o banco** — promete ser reprodutível, auditável e reconciliável: quando divergir, o usuário usa `POST /reserves/accounts/:id/reconcile` (§6.7), que registra a diferença como `adjustment` e ela conta como **rendimento**, não como aporte.

### 5.4 Rendimento e arredondamento

```ts
/** Half-up simétrico (away from zero). Entrada e saída em CENTAVOS. */
export function roundCents(v: number): number {
  return v < 0 ? -Math.round(-v) : Math.round(v)
}
```

```
R  = B × i        (float64; B e i NUNCA arredondados antes do produto)
R₂ = roundCents(R)
```

Sem epsilon mágico. `Math.round` já é half-up em direção a +∞; o espelhamento cobre negativos (`roundCents(-0.5) = -1`, `roundCents(1.5) = 2`, `roundCents(9425.8625) = 9426`).

**Regras de materialização:**

| Condição | Ação |
|---|---|
| `B = 0` (ou negativo, clampado) | **skip**, `reason: 'base_zero'` |
| `R₂ < 1` centavo | **skip**, `reason: 'zero_yield'` |
| `kind='cdi'` e nenhum CDI resolvível | **skip**, `reason: 'cdi_missing'` (nunca assume zero silenciosamente) |
| mês < mês de `opened_at` | **skip**, `reason: 'before_opening'` |
| caso contrário | grava/atualiza o movimento `yield` |

Gravação:
```ts
amount:            fromCents(R2),                 // "112.64"
occurredOn:        DateTime.fromObject({ year, month }).endOf('month'),
yieldPeriod:       'YYYY-MM',
yieldBase:         (B / 100).toFixed(6),          // decimal(14,6)
yieldRateApplied:  i.toFixed(10),                 // decimal(12,10)
yieldRateKind:     vigencia.rateKind,
yieldRateSource:   Number(vigencia.rateValue).toFixed(6),
yieldCdiAnnual:    cdiAnnual?.toFixed(6) ?? null,
```

**Precisão, honestamente:** o arredondamento de meio centavo por mês É capitalizado junto com o principal. Cota superior do desvio acumulado contra a fórmula contínua: `0,5 × [((1+i)^n − 1)/i]` centavos.

| cenário | desvio máximo |
|---|---|
| `i=0,0116`, 36 meses | **R$ 0,22** |
| `i=0,0116`, 120 meses | **R$ 1,29** |
| `i=0,0080`, 120 meses | **R$ 1,00** |

Isso é ordens de grandeza abaixo da divergência contra o banco real. **Não há carry de resíduo sub-centavo** (nos skips `zero_yield` o resíduo é descartado): carregá-lo introduziria uma variável de estado sem ganho perceptível — o resíduo perdido é < R$ 0,06/ano por conta.

### 5.5 Capitalização composta — emergente, não codificada

```
S_M = S_{M−1} + aportes_M + saques_M + R₂(M)
```
Como `R₂(M)` é datado no último dia de M, ele entra em `S₀(M+1)` com peso 1. Logo, sem aportes, `S_n = S₀ × Π(1 + i_k)` — **com a taxa de cada mês**, o que uma fórmula fechada `(1+i)^n` não representaria sob CDI variável.

**V3 — cadeia de 3 meses conferida** (`S₀ = R$ 10.000,00`, aporte R$ 500,00 no dia 1, `i = 0,0085`, `D = 31`):

| Mês | S₀ | B | R₂ | S final |
|---|---|---|---|---|
| M1 | 10.000,00 | 10.500,000000 | **89,25** | 10.589,25 |
| M2 | 10.589,25 | 11.089,250000 | **94,26** | 11.183,51 |
| M3 | 11.183,51 | 11.683,510000 | **99,31** | 11.782,82 |

(M2: `1108925 × 0,0085 = 9425,8625` centavos → half-up → `9426`.)

### 5.6 Rendimento PARCIAL do mês corrente (calculado, nunca gravado)

A apuração **nunca fecha o mês em curso**. Sem esta seção, `rendimentoDoMes` seria estruturalmente R$ 0,00 durante os ~30 dias do mês e o painel "Guardado" nasceria mostrando zero. Solução: calcular em memória, no caminho de leitura, e **rotular como parcial**.

Seja `t` = dia de hoje (1..D):

```
B_parcial = [ S₀ × t + Σ_k m_k × (t − d_k + 1) ] / D     (só movimentos com d_k ≤ t)
R_parcial = roundCents(B_parcial × i)
```

**Identidade verificada:** em `t = D`, `B_parcial === B` do mês cheio (bit a bit). Em `t = 1`, é exatamente um dia de juros sobre `S₀`.

**V10 — conferido.** Julho/2026 (`D = 31`), hoje dia 21, `S₀ = R$ 11.364,28`, depósito de R$ 1.500,00 no dia 5, `i = 0,0118757178`:

- `B_parcial = 8.520,963871` → **R_parcial = R$ 101,19**
- `B_cheio  = 12.670,731613` → **R_previsto (fim do mês) = R$ 150,47**

A API devolve os **dois**: `rendimentoParcialDoMes` (o que já rendeu) e `rendimentoPrevistoDoMes` (o que deve fechar). A UI mostra o parcial em destaque com a legenda "parcial · até hoje" e o previsto em `text-[11px]`.

### 5.7 Ordem de processamento da apuração

Para cada conta não arquivada, **do mês de `opened_at` até o mês-alvo, em ordem cronológica crescente**, tudo dentro de **uma** `db.transaction`:

1. resolve a vigência de taxa do mês (§3.2);
2. resolve o CDI anual do mês, se `kind='cdi'` (carry-forward → default);
3. calcula `S₀` e `B` lendo o razão **já com os yields dos meses anteriores gravados**;
4. `updateOrCreate` por `(reserveAccountId, yieldPeriod)`, passando `{ client: trx }`;
5. ao final, grava `last_closed_period = 'YYYY-MM'` do mês-alvo.

Regras duras:
- Alvo é **clampado** a `(hoje.year, hoje.month − 1)`. Nunca apura mês corrente nem futuro.
- Máximo **120 meses** por chamada por conta (protege a transação num backfill).
- O service **recebe o `trx` por parâmetro** e **nunca abre conexão própria** — os testes rodam no mesmo MySQL do dev e o isolamento é 100% `withGlobalTransaction`.
- **Reprocessar é uma função pura de (movimentos, vigências, CDI).** Os campos `yield_*` congelados na linha são para o humano ler; a recomputação **nunca** os lê. Rodar `close` N vezes com as mesmas entradas produz bytes idênticos.

### 5.8 Simulador e meta — mesma matemática, sem banco

```ts
const PROJ_DAYS = 30 // mês canônico da projeção

export function weightForDay(day: number, daysInMonth: number): number {
  const d = Math.min(Math.max(Math.trunc(day), 1), daysInMonth)
  return (daysInMonth - d + 1) / daysInMonth
}

export interface ProjectionPoint {
  mes: number
  aportadoCents: number
  rendimentoCents: number
  saldoCents: number
}

export function projectMonths(input: {
  saldoInicialCents: number
  aporteCents: number
  i: number
  meses: number
  diaDoAporte?: number // default 1
}): ProjectionPoint[] {
  const w = weightForDay(input.diaDoAporte ?? 1, PROJ_DAYS)
  let saldo = input.saldoInicialCents
  let aportado = input.saldoInicialCents
  let rendimento = 0
  const out: ProjectionPoint[] = []
  for (let m = 1; m <= input.meses; m++) {
    const base = saldo + input.aporteCents * w        // MESMA base ponderada do motor
    const r = roundCents(base * input.i)              // MESMO arredondamento por mês
    saldo += input.aporteCents + r
    aportado += input.aporteCents
    rendimento += r
    out.push({ mes: m, aportadoCents: aportado, rendimentoCents: rendimento, saldoCents: saldo })
  }
  return out
}
```

**O `diaDoAporte` é obrigatório na interface.** Assumir dia 1 silenciosamente é o erro mais caro do simulador: em 120 meses com A = R$ 1.000 e `i = 0,008`, a projeção "dia 1" dá **R$ 201.819,30** e a realidade de quem deposita todo dia 10 é **R$ 201.338,72** — **R$ 480,58 de diferença**, ~5.300× maior que o drift de arredondamento.

**Meta — `monthsToGoal` ITERA a mesma recorrência**, não uma fórmula fechada:

```ts
export function monthsToGoal(input: {
  saldoInicialCents: number
  aporteCents: number
  i: number
  metaCents: number
  diaDoAporte?: number
}): number | null {
  if (input.metaCents <= input.saldoInicialCents) return 0
  if (input.aporteCents <= 0 && input.i <= 0) return null
  const w = weightForDay(input.diaDoAporte ?? 1, PROJ_DAYS)
  let saldo = input.saldoInicialCents
  for (let m = 1; m <= 600; m++) {
    saldo += input.aporteCents + roundCents((saldo + input.aporteCents * w) * input.i)
    if (saldo >= input.metaCents) return m
  }
  return null // > 50 anos → "inalcançável neste ritmo"
}
```

**Por que iterar e não usar fórmula fechada:** o badge "faltam N meses" e o gráfico do simulador aparecem **na mesma tela**. A forma fechada da anuidade *postecipada* — `n = ln((A + G·i)/(A + B·i))/ln(1+i)` — é a errada para esta recorrência e diverge em **1 mês inteiro** em casos triviais:

| B | A | i | G | fórmula postecipada (errada) | recorrência real |
|---|---|---|---|---|---|
| 0 | 500 | 1% | 30.000 | 48 | **47** |
| 0 | 1.000 | 2% | 50.000 | 36 | **35** |
| 0 | 200 | 1,5% | 20.000 | 62 | **61** |

Iterar custa ≤ 600 passos e elimina a classe inteira de bug. A forma fechada **correta para esta recorrência** existe e é usada **apenas como oráculo de teste**:

```
A' = A × (1 + w·i)
S_n = B·(1+i)^n + A'·[((1+i)^n − 1)/i]
n   = ln[(G·i + A') / (B·i + A')] / ln(1+i)
```
Conferido: bate com a recorrência iterativa nos 5 casos de teste (§5.9 V9).

### 5.9 Vetores dourados (idênticos nos DOIS testes)

| # | Cenário | Resultado esperado |
|---|---|---|
| **V1** | `effectiveMonthlyRate('yearly', 10)` | `0.007974140429` (12 casas); `annualEquivalent(i) = 0.100000000000` (±1e-12) |
| **V1b** | rejeição do proporcional | `annualEquivalent(10/12/100) ≈ 0.104713` ≠ 0,10 |
| **V2** | `effectiveMonthlyRate('cdi', 100, 14.9)` | `0.0116415750`; `annualEquivalent(i) = 0.149` com erro < 1e-12 |
| **V2b** | `effectiveMonthlyRate('cdi', 102, 14.9)` / `(110, 14.9)` | `0.0118757178` / `0.0128128053` |
| **V2c** | `effectiveMonthlyRate('cdi', 100, null)` | `null` (→ skip `cdi_missing`) |
| **V3** | cadeia 3 meses, S₀ 10.000, A 500 dia 1, i 0,0085, D 31 | R: `89,25` / `94,26` / `99,31`; S final `11.782,82` |
| **V4** | D=31, S₀ 1.000, dep 3.000 dia 16, i 0,01 | peso `0.51612903`, B `2548.387097`, R `25,48` |
| **V5** | D=30, S₀ 5.000, saque 2.000 dia 10, i 0,01 | peso `0.70`, B `3600.000000`, R `36,00` |
| **V6** | invariantes de peso | base(S₀=10.000, 0 movs) `===` base(S₀=0, dep 10.000 dia 1); dep+saque mesmo dia ⇒ contribuição `0` |
| **V7** | `projectMonths` 120m, A 1.000, i 0,008, dia 1 | R$ `201.819,30`; forma fechada R$ `201.819,21`; drift ≤ R$ 0,50 |
| **V7b** | mesmo caso, **dia 10** (peso 0,7) | R$ `201.338,72`; diferença vs dia 1 = R$ `480,58` |
| **V8** | base R$ 0,40, i 0,0116415750 | `0,4657` centavos → `roundCents = 0` → **skip** `zero_yield` |
| **V9** | `monthsToGoal` iterativo vs oráculo fechado | iguais em: `(0,500,1%,30k)=47` · `(0,1000,2%,50k)=35` · `(0,200,1.5%,20k)=61` · `(10k,500,1.16%,30k)=28` · `(0,1000,0.8%,100k,dia 10)=74` |
| **V10** | parcial: D=31, t=21, S₀ 11.364,28, dep 1.500 dia 5, i 0,0118757178 | B parcial `8520.963871` → R parcial `101,19`; B cheio `12670.731613` → previsto `150,47`; em `t=D` as bases coincidem |
| **V11** | unidade (anti-fator-100) | `0,85% a.m.` sobre R$ 10.000 = **R$ 85,00** (não R$ 8.500,00 nem R$ 0,85) |
| **V12** | `roundCents` | `9425.8625→9426`, `0.5→1`, `-0.5→-1`, `1.5→2`, `-1.5→-2`, `0.4→0` |

### 5.10 Exemplo completo de vida de uma conta (conferido passo a passo)

Conta **"Reserva de emergência"**, Nubank, **102% do CDI**, CDI **14,90% a.a.** → `i = 0,0118757178` (**1,187572% a.m.**, ≈ **15,2195% a.a.**). Aberta em **10/04/2026** com saldo inicial de **R$ 10.000,00**.

| Mês | D | S₀ | Movimentos | Base ponderada B | R₂ | Saldo final |
|---|---|---|---|---|---|---|
| 2026-04 | 30 | 0,00 | `opening` R$ 10.000,00 dia 10 → peso `0,700000` → `7.000,000000` | `7.000,000000` | **R$ 83,13** | R$ 10.083,13 |
| 2026-05 | 31 | 10.083,13 | `deposit` R$ 1.500,00 dia 5 → peso `0,870968` → `1.306,451613` | `11.389,581613` | **R$ 135,26** | R$ 11.718,39 |
| 2026-06 | 30 | 11.718,39 | `deposit` R$ 1.500,00 dia 5 → `1.300,000000`; `withdrawal` −R$ 2.000,00 dia 20 → `−733,333333` | `12.285,056667` | **R$ 145,89** | R$ 11.364,28 |

- **Principal** (opening + depósitos − saques) = R$ 11.000,00
- **Rendimento acumulado** (saldo − principal) = **R$ 364,28**

**Julho/2026, hoje dia 21**, com um depósito de R$ 1.500,00 no dia 5:
- saldo hoje = R$ 12.864,28 · **rendimento parcial = R$ 101,19** · previsto para o fechamento = R$ 150,47

**Linha do extrato de junho, como o usuário lê:**
> `30/06/2026 · Rendimento · + R$ 145,89`
> `R$ 12.285,056667 × 1,187572% (102% do CDI de 14,90% a.a.)`

---

## 6. Superfície da API

Grupo único em `api/start/routes.ts` com `.use([middleware.auth(), middleware.currentWorkspace()])`.

> ⚠️ **ORDEM DE REGISTRO — literais ANTES de `:id`.** `reserves/summary`, `reserves/cdi`, `reserves/yield/close` e `reserves/movements` **devem** ser registradas antes de qualquer `reserves/accounts/:id`; e `reserves/accounts/:id/statement|reconcile` antes de `reserves/accounts/:id`. O AdonisJS casa na ordem de registro — errar aqui faz `Number(params.id)` virar `NaN` e produzir um 404 incompreensível (é a armadilha já documentada em comentário no grupo de `entries`).

Ordem canônica do grupo:

```
1. GET    reserves/summary
2. GET    reserves/cdi
3. PUT    reserves/cdi
4. POST   reserves/yield/close
5. GET    reserves/movements
6. POST   reserves/movements
7. PATCH  reserves/movements/:id
8. DELETE reserves/movements/:id
9. GET    reserves/accounts
10. POST  reserves/accounts
11. GET   reserves/accounts/:id/statement
12. POST  reserves/accounts/:id/reconcile
13. PATCH reserves/accounts/:id
14. DELETE reserves/accounts/:id
```

Nomes de rota: `reserves.summary`, `reserves.cdiIndex`, `reserves.cdiUpsert`, `reserves.closeYield`, `reserves.movementsIndex`, `reserves.movementsStore`, `reserves.movementsUpdate`, `reserves.movementsDestroy`, `reserves.index`, `reserves.store`, `reserves.statement`, `reserves.reconcile`, `reserves.update`, `reserves.destroy`.

Validators em `api/app/modules/reserves/reserve_validator.ts`.

---

### 6.1 `GET /api/v1/reserves/summary?year=&month=`

Consolidado do workspace. Alimenta o painel **Guardado** e o cabeçalho da página de Reservas.

**Validator** (`summaryQueryValidator`, via `.validate(request.qs())`):
```ts
vine.object({
  year: vine.number().withoutDecimals().min(2000).max(2200).optional(),
  month: vine.number().withoutDecimals().min(1).max(12).optional(),
})
```

**Resposta 200** (tudo agregado em JS → **números**):
```json
{
  "year": 2026, "month": 7,
  "totalGuardado": 12864.28,
  "totalPrincipal": 12500.00,
  "totalRendimento": 364.28,
  "rendimentoParcialDoMes": 101.19,
  "rendimentoPrevistoDoMes": 150.47,
  "rendimentoDoMesAnterior": 145.89,
  "rendimentoNoAno": 364.28,
  "contasAtivas": 1,
  "metaTotal": 30000.00,
  "metaProgresso": 0.4288,
  "porConta": [
    { "accountId": "1", "name": "Reserva de emergência", "color": "#4CAF82",
      "saldo": 12864.28, "rendimentoParcialDoMes": 101.19, "metaProgresso": 0.4288 }
  ],
  "evolucao12m": [
    { "year": 2026, "month": 4, "saldoFinal": 10083.13, "rendimento": 83.13, "aportes": 10000.00, "saques": 0 }
  ],
  "apuracao": {
    "pendente": true,
    "de": { "year": 2026, "month": 7 },
    "ate": { "year": 2026, "month": 6 },
    "contas": 1
  }
}
```
`apuracao.pendente` é derivado de `last_closed_period` (não de "existe linha de yield?"), portanto **converge** mesmo quando o mês foi processado e nada foi criado. `apuracao` é `{ "pendente": false }` quando tudo está em dia.

---

### 6.2 `GET /api/v1/reserves/accounts?includeArchived=`

**Validator:** `vine.object({ includeArchived: vine.boolean().optional() })`

**Resposta 200** — regra híbrida em ação:
```json
[{
  "id": "1",
  "name": "Reserva de emergência",
  "institution": "Nubank",
  "color": "#4CAF82",
  "openedAt": "2026-04-10",
  "goalAmount": "30000.00",
  "goalDate": "2027-12-31",
  "goalMonthlyContribution": "1500.00",
  "sortOrder": 0,
  "archived": false,
  "lastClosedPeriod": "2026-06",
  "rate": { "kind": "cdi", "value": "102.000000", "effectiveYear": 2026, "effectiveMonth": 4 },
  "cdiAnnual": 14.9,
  "cdiSource": "default",
  "taxaMensalEfetiva": 0.0118757178,
  "taxaAnualEquivalente": 0.15219528,
  "rateLabel": "102% do CDI · ≈1,19% a.m.",
  "saldo": 12864.28,
  "saldoInicial": 10000.00,
  "totalDepositado": 3000.00,
  "totalSacado": 2000.00,
  "totalAjustes": 0,
  "totalRendimento": 364.28,
  "rendimentoParcialDoMes": 101.19,
  "rendimentoPrevistoDoMes": 150.47,
  "metaProgresso": 0.4288,
  "metaFaltam": 17135.72,
  "metaEtaMeses": 11
}]
```
`goalAmount`, `rate.value` vêm de coluna `decimal` → **string**. `saldo`, `totalRendimento`, taxas, progresso → **número**.

---

### 6.3 `POST /api/v1/reserves/accounts`

Cria a conta **+** a primeira vigência de taxa **+** (se `saldoInicial > 0`) o movimento `opening` — tudo na **mesma transação**.

**Validator** (`createAccountValidator`):
```ts
vine.object({
  name: vine.string().trim().minLength(1).maxLength(120),
  institution: vine.string().trim().maxLength(120).optional(),
  color: vine.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  openedAt: vine.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rateKind: vine.enum(['monthly', 'yearly', 'cdi'] as const),
  rateValue: vine.number().min(0).max(1000),          // PERCENTUAL; 110% do CDI é válido
  saldoInicial: vine.number().min(0).optional(),       // vira movimento kind='opening'
  goalAmount: vine.number().min(0).optional(),
  goalDate: vine.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  goalMonthlyContribution: vine.number().min(0).optional(),
  sortOrder: vine.number().withoutDecimals().optional(),
})
```
Dinheiro entra como `vine.number()` em **todo** o módulo (convenção de `entries`, não a regex-string de `items`).

**Resposta 201:** mesmo shape de um item de §6.2.

---

### 6.4 `PATCH /api/v1/reserves/accounts/:id`

Todos os campos opcionais (mesmo conjunto de §6.3, menos `openedAt`, que é imutável).

- `rateKind`/`rateValue` → `updateOrCreate` da vigência do **mês corrente** (não reescreve o passado).
- `saldoInicial` → `updateOrCreate` do movimento `opening` datado em `openedAt`.
- Cross-workspace → **404** (`firstOrFail()` sobre query já escopada).

**Resposta 200:** shape de conta + `{ "recalcularSugerido": true }` quando a mudança afeta meses já apurados.

---

### 6.5 `DELETE /api/v1/reserves/accounts/:id`

Sem movimentos → apaga de verdade (CASCADE leva vigências). Com movimentos → arquiva.

**Resposta 200** (as **duas** chaves sempre, como `items`/`categories`):
```json
{ "archived": true, "deleted": false }
```

---

### 6.6 `GET /api/v1/reserves/accounts/:id/statement?year=&month=`

Extrato com saldo corrente linha a linha. Sem `year`/`month` → últimos 12 meses.

**Resposta 200:**
```json
{
  "accountId": "1",
  "from": "2026-04-01", "to": "2026-07-31",
  "saldoInicial": 0, "saldoFinal": 12864.28,
  "movements": [
    { "id": "4", "kind": "deposit", "occurredOn": "2026-07-05",
      "amount": "1500.00", "signedAmount": 1500.00, "description": null,
      "saldoApos": 12864.28, "editavel": true, "yield": null },
    { "id": "3", "kind": "yield", "occurredOn": "2026-06-30",
      "amount": "145.89", "signedAmount": 145.89, "description": null,
      "saldoApos": 11364.28, "editavel": false,
      "yield": { "period": "2026-06", "base": "12285.056667",
                 "rateKind": "cdi", "rateSource": "102.000000",
                 "rateApplied": "0.0118757178", "cdiAnnual": "14.900000",
                 "cdiSource": "default" } },
    { "id": "2", "kind": "withdrawal", "occurredOn": "2026-06-20",
      "amount": "-2000.00", "signedAmount": -2000.00, "description": "Conserto do carro",
      "saldoApos": 11218.39, "editavel": true, "yield": null }
  ]
}
```
`amount` sai como **string assinada** (é coluna decimal); `signedAmount` e `saldoApos` são **números** para a UI não recalcular.

---

### 6.7 `POST /api/v1/reserves/accounts/:id/reconcile`

**"Quanto tem hoje na caixinha, segundo o banco?"** — o app calcula o delta e grava um `adjustment`. É a única forma de criar um ajuste, e o único fluxo que impede a divergência com o extrato de virar permanente.

**Validator:**
```ts
vine.object({
  balance: vine.number().min(0),                                  // saldo REAL do extrato
  occurredOn: vine.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // default: hoje
  description: vine.string().trim().maxLength(180).optional(),
})
```

O service calcula `delta = toCents(balance) − saldoCents(occurredOn)`. Se `delta === 0`, não grava nada.

**Resposta 200:**
```json
{ "adjusted": true, "delta": 12.40, "movementId": "9",
  "saldoAnterior": 12864.28, "saldoAtual": 12876.68,
  "recalcularSugerido": false }
```

**`adjustment` conta como RENDIMENTO, não como principal** (`totalRendimento = Σ yield + Σ adjustment`). Motivo: a diferença contra o extrato é, esmagadoramente, rendimento real não modelado (dias úteis, aniversário da aplicação). Contá-la como aporte inflaria "quanto eu coloquei" e encolheria "quanto rendeu" a cada reconciliação, corrompendo as duas métricas.

---

### 6.8 `GET /api/v1/reserves/movements?accountId=&kind=&from=&to=&limit=`

**Validator:**
```ts
vine.object({
  accountId: vine.number().withoutDecimals().optional(),
  kind: vine.enum(['opening','deposit','withdrawal','adjustment','yield'] as const).optional(),
  from: vine.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: vine.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: vine.number().withoutDecimals().min(1).max(500).optional(),   // default 50
})
```

**Resposta 200:** lista plana ordenada por `occurred_on desc, id desc`, com `accountName` e `accountColor` embutidos.

---

### 6.9 `POST /api/v1/reserves/movements`

**Validator** (`createMovementValidator`):
```ts
vine.object({
  accountId: vine.number().withoutDecimals(),
  kind: vine.enum(['deposit', 'withdrawal'] as const),  // ← só estes dois
  occurredOn: vine.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: vine.number().min(0.01),                      // POSITIVO; o service assina
  description: vine.string().trim().maxLength(180).optional(),
})
```

`opening` só nasce de `POST/PATCH /accounts`; `adjustment` só de `/reconcile`; `yield` só do `YieldService`. Nenhum dos três é alcançável por esta rota — o enum do validator é a garantia.

O service normaliza o sinal: `deposit → +Math.abs(v)`, `withdrawal → −Math.abs(v)`. Valida o `accountId` com o mesmo padrão `firstOrFail()` escopado antes de gravar.

**Saldo negativo não é bloqueado** (o razão registra fatos; não há throw de domínio em nenhum lugar do repositório). A resposta sinaliza e a UI avisa **antes**.

**Resposta 201:**
```json
{ "id": "10", "accountId": "1", "kind": "withdrawal", "occurredOn": "2026-07-14",
  "amount": "-200.00", "signedAmount": -200.00, "description": "Farmácia",
  "saldoDaConta": 12664.28, "saldoNegativo": false,
  "recalcularSugerido": false }
```
`recalcularSugerido` é `true` quando `occurredOn` cai em mês `<= last_closed_period`.

---

### 6.10 `PATCH /api/v1/reserves/movements/:id` · `DELETE /api/v1/reserves/movements/:id`

**Validator do PATCH:** todos os campos de §6.9 opcionais, exceto `accountId` (imutável).

As duas queries carregam **`.whereNot('kind', 'yield')`**, portanto tentar editar/apagar um rendimento devolve **404** — consistente com o padrão de 404 do repositório, sem `throw` manual. Rendimento muda apenas reexecutando a apuração.

**DELETE 200:** `{ "deleted": true, "saldoDaConta": 12864.28, "recalcularSugerido": true }`

---

### 6.11 `POST /api/v1/reserves/yield/close`

**Validator:**
```ts
vine.object({
  year: vine.number().withoutDecimals().min(2000).max(2200).optional(),  // default: mês anterior
  month: vine.number().withoutDecimals().min(1).max(12).optional(),
  accountId: vine.number().withoutDecimals().optional(),                 // default: todas
})
```

**Resposta 200:**
```json
{
  "throughPeriod": "2026-06",
  "processed": 3, "created": 3, "updated": 0, "unchanged": 0,
  "totalCreditado": 364.28,
  "details": [
    { "accountId": "1", "accountName": "Reserva de emergência", "period": "2026-06",
      "amountBefore": null, "amountAfter": "145.89",
      "base": "12285.056667", "rateApplied": "0.0118757178", "cdiSource": "default" }
  ],
  "skipped": [
    { "accountId": "2", "accountName": "Viagem", "period": "2026-05", "reason": "base_zero" }
  ]
}
```
`skipped` é **renderizado na UI** (não só logado): sem isso, uma conta em `% do CDI` sem taxa resolvível falharia silenciosamente com "R$ 0,00 apurado" e o usuário não teria nenhuma pista.

---

### 6.12 `GET /api/v1/reserves/cdi?year=` · `PUT /api/v1/reserves/cdi`

**GET validator:** `vine.object({ year: vine.number().withoutDecimals().min(2000).max(2200).optional() })`

**GET 200:**
```json
{ "vigenteHoje": { "annualRate": 14.9, "source": "default", "year": null, "month": null,
                   "mensalEquivalente": 0.0116415750 },
  "historico": [ { "id": "1", "year": 2026, "month": 1, "annualRate": "14.900000" } ] }
```

**PUT validator:**
```ts
vine.object({
  year: vine.number().withoutDecimals().min(2000).max(2200),
  month: vine.number().withoutDecimals().min(1).max(12),
  annualRate: vine.number().min(0).max(100),   // PERCENTUAL ANUAL
})
```

**PUT 200:** `{ "id": "2", "year": 2026, "month": 7, "annualRate": "15.000000", "contasEmCdi": 2, "recalcularSugerido": true }`

---

## 7. Superfície Web

### 7.1 Roteador e menu (arquivos COMPARTILHADOS)

**`web/src/app/router.tsx`** — dentro de `ProtectedRoute > AppLayout children`, **depois de `assinaturas`**:
```tsx
{ path: 'reservas', element: <ReservasPage /> },
```
Import default: `import ReservasPage from '@/features/reservas/ReservasPage'`. Uma rota só — o simulador e o extrato são abas/diálogos, não rotas (a sidebar é plana e sem submenu).

**`web/src/app/AppLayout.tsx`** — `NAV_ITEMS` ganha, entre *Assinaturas* e *Histórico*:
```ts
{ to: '/reservas', label: 'Reservas', icon: PiggyBank },
```
`PiggyBank` entra no import existente de `lucide-react`. Ordem final: Dashboard · Lançamentos · Itens · Categorias · Assinaturas · **Reservas** · Histórico · Importar.

> A página **não** cria container com `overflow-y-auto` próprio — o `<main>` do `AppLayout` é o scroller único do `PullToRefresh`, e um wrapper próprio quebra a detecção de topo do gesto.

### 7.2 Arquivos novos

| Caminho | Papel |
|---|---|
| `web/src/features/reservas/interest.ts` | **espelho** de `api/app/modules/reserves/interest.ts` — puro, sem JSX/DOM/api |
| `web/src/features/reservas/interest.test.ts` | vetores V1..V12 |
| `web/src/features/reservas/useReserves.ts` | tipos da API + query keys + todos os hooks |
| `web/src/features/reservas/ReservasPage.tsx` | `export default`, rota `/reservas` |
| `web/src/features/reservas/TotalGuardadoHeader.tsx` | consolidado grande + rendimento parcial + chip do CDI |
| `web/src/features/reservas/YieldCloseBanner.tsx` | banner "Atualizar rendimentos" |
| `web/src/features/reservas/ReserveAccountCard.tsx` | card por caixinha |
| `web/src/features/reservas/GoalProgressBar.tsx` | meta com `<Progress>` + ETA |
| `web/src/features/reservas/ReserveAccountFormDialog.tsx` | criar + editar |
| `web/src/features/reservas/MovementFormDialog.tsx` | depósito / saque |
| `web/src/features/reservas/MovementRow.tsx` | linha do extrato/lista |
| `web/src/features/reservas/MovementsTab.tsx` | aba "Movimentações" (todas as contas) |
| `web/src/features/reservas/AccountStatementDialog.tsx` | extrato com memória de cálculo |
| `web/src/features/reservas/ReconcileDialog.tsx` | "Acertar saldo com o banco" |
| `web/src/features/reservas/CdiRateDialog.tsx` | CDI anual + histórico |
| `web/src/features/reservas/ProjectionSimulator.tsx` | aba "Simulador" |
| `web/src/features/reservas/ProjectionChart.tsx` | AreaChart Aportado × Com rendimento |
| `web/src/features/dashboard/panels/GuardadoPanel.tsx` | 5º painel do carrossel |

### 7.3 `useReserves.ts` — tipos, keys e hooks

```ts
export const RESERVES_KEY = ['reserves'] as const
export const reserveAccountsKey = (includeArchived = false) =>
  ['reserves', 'accounts', includeArchived] as const
export const reserveSummaryKey = (year: number, month: number) =>
  ['reserves', 'summary', year, month] as const
export const reserveStatementKey = (id: string, year?: number, month?: number) =>
  ['reserves', 'statement', id, year ?? 'all', month ?? 'all'] as const
export const reserveMovementsKey = (accountId?: string, kind?: string) =>
  ['reserves', 'movements', accountId ?? 'all', kind ?? 'all'] as const
export const cdiKey = (year?: number) => ['reserves', 'cdi', year ?? 'all'] as const
```

Hooks: `useReserveAccounts`, `useReserveSummary`, `useReserveStatement`, `useReserveMovements`, `useCdi`, `useCreateReserveAccount`, `useUpdateReserveAccount`, `useDeleteReserveAccount`, `useCreateMovement`, `useUpdateMovement`, `useDeleteMovement`, `useReconcileAccount`, `useCloseYield`, `useUpsertCdi`.

**Toda** mutation invalida pelo **prefixo raiz**, com `void`:
```ts
onSuccess: () => { void qc.invalidateQueries({ queryKey: ['reserves'] }) }
```
Uma linha derruba `accounts` + `summary` + `statement` + `movements` + `cdi` — o que é exatamente o certo, porque saldo e rendimento são derivados e qualquer escrita muda tudo.

**Sem optimistic update** neste módulo: saldo derivado + rendimento materializado tornam a previsão local traiçoeira. **Sem toast dentro dos hooks** — quem chama `mutateAsync` faz o `try/catch` e o `toast` em pt-BR.

**Tipos** com docblock explicando a regra híbrida:
```ts
export interface ReserveAccount {
  id: string
  /** decimal(12,2) do banco → STRING, ex.: "30000.00" */
  goalAmount: string | null
  /** agregado em JS → NÚMERO */
  saldo: number
  /** fração 0..1 (como percentualPago do dashboard) */
  metaProgresso: number | null
  archived: boolean | number    // driver serializa boolean como 0/1
}
```

**Auto-apuração (elimina o ritual manual):** `ReservasPage` e `GuardadoPanel` disparam `useCloseYield()` **uma vez por montagem** quando `summary.apuracao.pendente === true` e nenhuma apuração está em voo. Continua sendo um `POST`, continua idempotente, continua auditável — e o usuário não precisa saber que existe. O `YieldCloseBanner` fica como fallback visível/manual e como explicação quando há `skipped`.

### 7.4 Componentes — pontos de projeto que não podem escorregar

**`ReservasPage.tsx`** — `div.space-y-6`:
1. header (`h1 text-2xl font-bold tracking-tight text-foreground` "Reservas" + `p text-sm text-muted-foreground` "Suas caixinhas, o quanto elas rendem e quando você chega na meta" + `Button` "Nova caixinha" com `<Plus className="h-4 w-4" />`);
2. `<TotalGuardadoHeader />`;
3. `<YieldCloseBanner />`;
4. `<Tabs>` **controlado** (`value` + `onValueChange` obrigatórios — a implementação é própria do repo) com **Caixinhas · Movimentações · Simulador**, painel renderizado **fora** do `<Tabs>` (padrão do `ItensPage`);
5. diálogos.

Estados: `formOpen`, `editing`, `toDelete: ReserveAccount | null`, `movementOpen`, `statementFor`, `reconcileFor`, `cdiOpen`, `tab`.
Exclusão via `<DeleteConfirmDialog>` **compartilhado** de `@/components/DeleteConfirmDialog` (`entityLabel="a caixinha"`, `hint="Se ela tiver movimentações, será arquivada em vez de excluída."`).

**`ReserveAccountFormDialog.tsx`** — react-hook-form + `zodResolver` + zod local, mensagens em pt-BR. Campos: `name`, `institution`, `openedAt` (`<Input type="date">` — não existe date-picker no repo), `saldoInicial` (**só no create**, `parseAmountInput`), `rateKind` (Radix `Select` — obrigatório, **sem** sentinela `'__none__'`), `rateValue` (`<Input type="text" inputMode="decimal">` com sufixo dinâmico `% a.m.` / `% a.a.` / `% do CDI`), `goalAmount`, `goalDate`, `goalMonthlyContribution`, `color` (`<Input type="color">`).

**Preview ao vivo abaixo do campo de taxa** (calculado por `./interest`), sempre com as **três leituras**:
> `Equivale a 1,1876% ao mês · 15,2195% ao ano · em R$ 10.000 renderia R$ 118,76/mês`

É a defesa contra o erro mais provável do usuário (digitar `12` pensando em "% ao ano" num campo "% ao mês") e contra o mito de que anual÷12 = mensal.

**`MovementFormDialog.tsx`** — `kind` (Select Depósito/Saque), `accountId` (Select com `String(acc.id)` — ids podem vir como number em runtime), `occurredOn` (`type="date"`, default hoje montado com `getFullYear/getMonth/getDate`, **nunca** `toISOString()`), `amount` (`parseAmountInput` → **number positivo** no payload), `description`.

Dois avisos em tempo real:
- saque > saldo → `<p className="text-xs text-destructive">Este saque deixa a caixinha com saldo negativo (R$ -120,00).</p>` e o botão vira "Registrar mesmo assim";
- data em mês já fechado → "Isso vai atualizar os rendimentos de março em diante."

Texto fixo de regra: **"O dinheiro rende a partir do dia em que entra."**

**`AccountStatementDialog.tsx`** — `DialogContent className="sm:max-w-2xl"` (não existe `Sheet`). Agrupado por mês; ícone por kind (`ArrowDownCircle` verde / `ArrowUpCircle` vermelho / `Sparkles` âmbar para `yield` / `Scale` para `adjustment` / `Landmark` para `opening`); valor `tabular-nums` com sinal e cor via `cn()`; saldo corrente à direita em `text-xs text-muted-foreground tabular-nums`.

Linhas de `yield` trazem a **memória de cálculo** em `text-[11px] text-muted-foreground`:
> `R$ 12.285,056667 × 1,187572% (102% do CDI de 14,90% a.a.)`

e badge `CDI estimado` quando `cdiSource !== 'exact'`. Yield **não tem** botões de editar/excluir.

**`GuardadoPanel.tsx`** — mora em `features/dashboard/panels/`, consome `useReserveSummary` de `@/features/reservas/useReserves` (import cross-feature com alias `@`, convenção do repo). Estrutura do `BalancoPanel`: skeleton → `Card className="flex h-full flex-col justify-center rounded-2xl p-6 shadow-sm"`, título `<p className="text-sm font-medium text-muted-foreground">Guardado</p>`, total em `text-2xl font-semibold tabular-nums truncate`, `<ProgressRing pct={Math.round((metaProgresso ?? 0) * 100)} />` à direita com rótulo absoluto sobreposto, linha "Rendeu R$ 101,19 este mês" em `text-primary-strong` com `<TrendingUp />` e legenda `text-[11px]` "parcial · até hoje".

> ⚠️ **NUNCA `if (!data) return null`.** Sem contas, renderiza estado vazio textual ("Nenhuma caixinha ainda" + link "Criar a primeira"). Um painel `null` continua ocupando um `CarouselItem` **e um dot**, deixando um slide em branco.

> ⚠️ `metaProgresso` é **fração 0..1** (como `percentualPago`); o `ProgressRing` espera **0..100**. Esquecer o `× 100` já mordeu no `ResumoPanel`.

**`ProjectionSimulator.tsx`** — 100% client-side (`useMemo` + `useDeferredValue` com debounce de ~150 ms; zero request por tecla). Entradas: saldo inicial (pré-preenchido com `summary.totalGuardado`), aporte mensal, **dia do aporte** (default 1 — campo visível, não premissa escondida), tipo + valor de taxa (pré-preenchido com a taxa da maior caixinha), CDI anual (só quando `kind='cdi'`), prazo com presets 12/24/60/120 + `Input` numérico (não existe primitivo slider). Saídas: "Total aportado" · "Rendimento no período" (`text-primary-strong`) · "Valor final", mais "Você atinge sua meta em set/2029 (**39 meses**)" vindo de `monthsToGoal` — **a mesma função que gera o gráfico**, portanto badge e curva nunca se contradizem.

**`ProjectionChart.tsx`** — boilerplate exato do repo: `ResponsiveContainer 100%×300`, `margin {top:4,right:16,left:0,bottom:4}`, `CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false}`, eixos sem `axisLine`/`tickLine` com `fill: '#6B7280'`, `YAxis tickFormatter={compactBRL} width={72}`, `Legend iconType="circle" iconSize={8}`, `Tooltip content={fn}` com **função** tipada por `TooltipContentProps` (**nunca** `content={<Fn/>}`). `AreaChart` com duas séries não empilhadas: **Aportado** `#6B7280` (fill 0.15) e **Com rendimento** `#4CAF82` (fill 0.25) — a área entre elas *é* o efeito dos juros compostos. Cores são **hex literais**, não CSS vars. Estado vazio textual em `div.h-[300px]`, nunca `null`.

### 7.5 `web/src/lib/format.ts` (arquivo COMPARTILHADO — alterado)

Acrescenta:
```ts
/** 0.0118757178 → "1,1876%" (Intl pt-BR, NBSP normalizado como formatBRL) */
export function formatPercentBR(fraction: number, casas = 4): string

/** ('cdi', '102.000000', 0.0118757178) → "102% do CDI · ≈1,19% a.m." */
export function formatRateLabel(kind: string, value: string, monthlyRate: number | null): string
```

### 7.6 `web/src/features/dashboard/DashboardPage.tsx` (arquivo COMPARTILHADO — alterado)

Passa a chamar `useReserveSummary(year, month)` e insere o 5º painel em **3ª posição**:

```tsx
<Carousel gridClassName="lg:grid-cols-2">
  <CarouselItem><ResumoPanel  data={dashData} isLoading={dashLoading} /></CarouselItem>
  <CarouselItem><BalancoPanel data={dashData} isLoading={dashLoading} /></CarouselItem>
  <CarouselItem><GuardadoPanel data={reservesData} isLoading={reservesLoading} /></CarouselItem>
  <CarouselItem><YearlyEvolutionChart   data={yearlyData?.months} isLoading={yearlyLoading} /></CarouselItem>
  <CarouselItem><CategoryBreakdownChart data={dashData?.breakdownPorCategoria} isLoading={dashLoading} /></CarouselItem>
</Carousel>
```

`gridClassName="lg:grid-cols-2"` permanece: 5 painéis → 3 linhas com a última célula vazia (melhor que 3 colunas, que espremeria os gráficos).

---

## 8. Plano de testes

### 8.1 API — unit puro (Japa)

**`api/tests/unit/reserve_interest.spec.ts`**

> ⚠️ O nome e o diretório são **obrigatórios**. As suítes em `api/adonisrc.ts` são `tests/unit/**/*.spec.{ts,js}` e `tests/functional/**/*.spec.{ts,js}`. Um arquivo `interest.test.ts` dentro de `app/modules/reserves/` **nunca seria executado** e falharia em silêncio — justamente no lado que escreve dinheiro no banco. Padrão: `test.group('Nome', () => {...})` **sem** segundo parâmetro, callbacks síncronos, sem hook de banco. Timeout da suíte unit é **2000 ms**.

Grupos e casos (todos os vetores de §5.9):

| Grupo | Casos |
|---|---|
| `Reservas – taxa efetiva mensal` | V1, V1b, V2, V2b, V2c + propriedade `21×12=252` |
| `Reservas – pesos e base ponderada` | V4, V5, V6 (3 invariantes), clamp `B < 0 → 0` |
| `Reservas – arredondamento` | V12, V8 |
| `Reservas – capitalização composta` | V3 (cadeia de 3 meses, `assert.equal` em centavos inteiros) |
| `Reservas – rendimento parcial` | V10, identidade `t = D` |
| `Reservas – projeção e meta` | V7, V7b, V9 (iterativo vs oráculo fechado), `monthsToGoal` null em `A=0 ∧ i=0`, `meta ≤ saldo → 0`, `> 600 → null` |
| `Reservas – unidades` | V11 (0,85% a.m. sobre R$ 10.000 = R$ 85,00) |

### 8.2 API — funcional (Japa)

**`api/tests/functional/reserves.spec.ts`** — `test.group('Reservas', (group) => { group.each.setup(() => testUtils.db().withGlobalTransaction()) })`, autenticação via `registerAndAuth(client, 'email-unico@test.com')` de `./helpers.js`, `.bearerToken(token)`.

Cobertura mínima:

1. `POST /reserves/accounts` → **201**; cria vigência de taxa e movimento `opening`; `GET /reserves/accounts` inclui e traz `saldo` = saldo inicial.
2. `POST /reserves/accounts` com `name: ''` → **422**; com `rateKind: 'diario'` → **422**; `rateValue: 110` com `kind='cdi'` → **201** (não há teto de 100%).
3. `GET /reserves/accounts` **sem token** → **401**.
4. **Isolamento cross-workspace** (obrigatório): B não vê a conta de A na lista (`assert.notInclude`), `PATCH` de B → **404**, `DELETE` de B → **404**, `GET .../statement` de B → **404**.
5. `POST /reserves/movements` depósito → 201 e `saldoDaConta` correto; saque grava `amount` **negativo** (`assert.equal(body.amount, '-200.00')`).
6. `POST /reserves/movements` com `kind: 'yield'` → **422** (enum do validator).
7. **Apuração**: 3 meses de movimentos → `POST /reserves/yield/close` cria 3 yields; valores batem com o exemplo §5.10 (`'83.13'`, `'135.26'`, `'145.89'`) e o saldo final é `11364.28`.
8. **Idempotência**: rodar `close` **3×** seguidas → `created: 0, updated: 0, unchanged: N` nas execuções 2 e 3, e os `amount`/`yield_base` **idênticos byte a byte**.
9. **Reprocessamento após edição retroativa**: apaga um depósito antigo, roda `close`, e os yields dos meses seguintes mudam de forma consistente (novo saldo bate com o recálculo manual).
10. `PATCH`/`DELETE` de um movimento `kind='yield'` → **404**.
11. **Banner converge**: conta sem saldo em 2 meses → `close` retorna `skipped: [base_zero, base_zero]` e `created: 0`; um `GET /reserves/summary` seguinte devolve `apuracao.pendente === false` (é o teste que prova que `last_closed_period` resolve o loop infinito do banner).
12. **CDI**: sem linha → `cdiSource: 'default'` e a apuração acontece; `PUT /reserves/cdi` → 200; um `close` posterior usa o CDI da vigência **de cada mês** (mês antes da vigência usa o valor anterior).
13. **Reconciliação**: `POST /reserves/accounts/:id/reconcile` com `balance` maior que o saldo → cria `adjustment` com o delta exato; `totalRendimento` **sobe** e `totalPrincipal` **não muda**.
14. `DELETE /reserves/accounts/:id` sem movimentos → `{ deleted: true, archived: false }`; com movimentos → `{ deleted: false, archived: true }` e a conta some da listagem padrão.
15. `GET /reserves/summary` → **200**, `apuracao` presente, e a rota literal **não** é capturada como `:id` (regressão da ordem de rotas).
16. **Backfill de 36 meses** numa transação: mede que a chamada completa dentro do timeout de 30 s da suíte functional.

> Asserções: ids sempre via `Number(...)`; booleanos via `assert.isOk`/`assert.isNotOk` (o driver serializa 0/1); dinheiro de coluna comparado como **string** (`'145.89'`), agregado como **número**.

### 8.3 Web — Vitest + RTL (co-locados, descrições em pt-BR, `vi.mock` do hook, sem `QueryClientProvider`)

| Arquivo | Casos |
|---|---|
| `web/src/features/reservas/interest.test.ts` | **V1..V12, idênticos ao spec Japa** — é o teste mais importante da feature |
| `web/src/features/reservas/ReservasPage.test.tsx` | renderiza total consolidado formatado (`R$ 12.864,28`) e uma linha por caixinha; mostra o banner quando `apuracao.pendente`; loading via `container.querySelector('.animate-pulse')` |
| `web/src/features/dashboard/panels/GuardadoPanel.test.tsx` | renderiza total + anel de meta em 43%; **estado vazio textual sem contas (não retorna null)**; mostra "parcial" no rótulo do rendimento |
| `web/src/features/reservas/ProjectionSimulator.test.tsx` | 120 meses, A=1.000, i=0,008, dia 1 → `R$ 201.819,30`; trocar o dia do aporte para 10 muda o resultado para `R$ 201.338,72`; badge de meta e curva concordam |
| `web/src/features/reservas/GoalProgressBar.test.tsx` | fração 0..1 → percentual inteiro; "Meta atingida" em `>= 100%` |
| `web/src/features/reservas/ReserveAccountFormDialog.test.tsx` | preview de taxa: `12,5% a.a.` mostra `≈0,9864% a.m.`; `102% do CDI` mostra `≈1,19% a.m.` |
| `web/src/lib/format.test.ts` (**alterado**) | `formatPercentBR`, `formatRateLabel` |
| `web/src/features/dashboard/DashboardPage.test.tsx` (**alterado**) | `toHaveLength(4)` → **`toHaveLength(5)`** + `vi.mock('@/features/reservas/useReserves')` |

> Sem o `vi.mock` de `useReserves`, o `DashboardPage` chama `useQuery` sem provider e o teste morre com *"No QueryClient set"*. As duas correções fazem parte da task do painel, não são "consertos depois".

### 8.4 Comandos

```
npm --prefix api run ace -- migration:run       # regenera api/database/schema.ts
npm --prefix api test                            # Japa (exige MySQL de pé; usa o banco de DEV)
npm --prefix api test -- unit --files=reserve_interest.spec.ts
npm --prefix api run typecheck
npm --prefix web run test -- src/features/reservas/interest.test.ts
npm --prefix web run build                       # tsc -b && vite build
npm --prefix web run lint                        # oxlint
```

---

## 9. Tarefas de implementação

**Legenda de arquivos COMPARTILHADOS** (só um dono, nunca editados em paralelo):

| Arquivo compartilhado | Dono único | Onda |
|---|---|---|
| `api/database/schema.ts` (**gerado**, nunca à mão) | **T1** | 0 |
| `api/start/routes.ts` | **T12** | 4 |
| `api/.adonisjs/**` (gerado pelo Tuyau) | **T12** | 4 |
| `web/src/lib/format.ts` (+ `.test.ts`) | **T15** | 5 |
| `web/src/app/router.tsx` | **T22** | 7 |
| `web/src/app/AppLayout.tsx` | **T22** | 7 |
| `web/src/features/dashboard/DashboardPage.tsx` (+ `.test.tsx`) | **T22** | 7 |

---

### Onda 0 — Fundação (sequencial; bloqueia todo o backend)

#### T1 — Migrations + regeneração do schema + models
- **Arquivos:** `api/database/migrations/1782800000001..4_*.ts` (novos) · `api/database/schema.ts` (**regenerado**, commitado) · `api/app/models/{reserve_account,reserve_rate_period,reserve_movement,cdi_rate}.ts` (novos)
- **Aceite:** `npm --prefix api run ace -- migration:run` roda limpo; o diff de `schema.ts` contém **exatamente** as 4 classes de §4 (colunas em ordem alfabética, `decimal → string`, `date → DateTime` com `@column.date()`, `bigIncrements → bigint | number`); os 4 models só declaram relações (zero `@column`); `npm --prefix api run typecheck` passa. `schema.ts` **não** foi editado à mão.

---

### Onda 1 — Núcleos puros (2 tarefas paralelas, zero arquivo em comum)

#### T2 — Motor de juros da API
- **Arquivos:** `api/app/modules/reserves/interest.ts` · `api/tests/unit/reserve_interest.spec.ts`
- **Aceite:** exporta `toCents`, `fromCents`, `roundCents`, `weightForDay`, `effectiveMonthlyRate`, `annualEquivalent`, `weightedBaseCents`, `partialBaseCents`, `projectMonths`, `monthsToGoal`. Zero import de Lucid/HttpContext/DateTime. `npm --prefix api test -- unit --files=reserve_interest.spec.ts` passa com **V1..V12**.

#### T3 — Motor de juros do Web (espelho)
- **Arquivos:** `web/src/features/reservas/interest.ts` · `web/src/features/reservas/interest.test.ts`
- **Aceite:** mesmos exports, mesma implementação, cabeçalho de espelho presente; `npm --prefix web run test -- src/features/reservas/interest.test.ts` passa com **os mesmos V1..V12**.

---

### Onda 2 — Serviços de leitura (3 tarefas paralelas; dependem de T1/T2)

#### T4 — Resolução de taxas e CDI
- **Arquivos:** `api/app/modules/reserves/rate_service.ts` · `api/app/modules/reserves/cdi_defaults.ts`
- **Aceite:** `resolveRatePeriod(workspaceId, accountId, year, month)` devolve a vigência mais recente `<= (year,month)` (e a mais antiga se nenhuma casar); `resolveCdiAnnual(workspaceId, year, month)` faz carry-forward e cai em `DEFAULT_CDI_ANNUAL` com `source: 'default'`; ambos aceitam `trx` opcional e **nunca abrem conexão própria**.

#### T5 — Razão (saldos derivados e extrato)
- **Arquivos:** `api/app/modules/reserves/ledger_service.ts`
- **Aceite:** `balanceCents(workspaceId, accountId, asOf?)` via `SUM(amount)`; `monthMovements(...)`; `weightedBaseFor(...)` e `partialYieldFor(...)` usando `interest.ts`; `statement(...)` com saldo corrente. Toda query começa por `.where('workspace_id', workspaceId)`; `workspaceId: number` é sempre o **1º parâmetro**.

#### T6 — Validators do módulo
- **Arquivos:** `api/app/modules/reserves/reserve_validator.ts`
- **Aceite:** exporta `createAccountValidator`, `updateAccountValidator`, `createMovementValidator`, `updateMovementValidator`, `reconcileValidator`, `closeYieldValidator`, `upsertCdiValidator`, `summaryQueryValidator`, `movementsQueryValidator`, `statementQueryValidator`, `accountsQueryValidator` — todos via `vine.compile(vine.object({...}))` com JSDoc campo a campo. `createMovementValidator.kind` é `enum(['deposit','withdrawal'])`.

---

### Onda 3 — Serviços de escrita (3 tarefas paralelas; dependem de T4/T5)

#### T7 — Apuração de rendimento
- **Arquivos:** `api/app/modules/reserves/yield_service.ts`
- **Aceite:** processa da abertura ao alvo em ordem crescente dentro de **uma** `db.transaction`; `updateOrCreate` por `(reserveAccountId, yieldPeriod)` com `{ client: trx }`; clampa o alvo a `mês corrente − 1`; máx. 120 meses; grava `last_closed_period`; devolve `details` + `skipped` com `reason`; **3 execuções seguidas produzem bytes idênticos**.

#### T8 — Contas
- **Arquivos:** `api/app/modules/reserves/reserve_account_service.ts`
- **Aceite:** `create` grava conta + vigência + `opening` na mesma transação; `update` faz `updateOrCreate` da vigência do mês corrente e do `opening`; `destroy` devolve `{ archived, deleted }`; `list` monta a view de §6.2 com taxa resolvida, saldos derivados e rendimento parcial; 404 nasce de `firstOrFail()` escopado.

#### T9 — Movimentações e reconciliação
- **Arquivos:** `api/app/modules/reserves/reserve_movement_service.ts`
- **Aceite:** normaliza o sinal por kind; `update`/`destroy` usam `.whereNot('kind','yield')`; `reconcile` calcula o delta e grava `adjustment` (no-op quando delta = 0); `recalcularSugerido` é `true` quando `occurredOn <= last_closed_period`; saldo negativo **não** é bloqueado.

---

### Onda 4 — Exposição HTTP (1 tarefa; arquivo compartilhado)

#### T10 — Controllers + rotas
- **Arquivos:** `api/app/modules/reserves/reserves_controller.ts` (novo) · `api/start/routes.ts` (**compartilhado**) · `api/.adonisjs/**` (regenerado)
- **Aceite:** classe com `@inject()` e services injetados no construtor; cada método desestrutura `{ request, params, workspace, response }` e converte com `Number(...)`; resposta sempre via `response.ok/created` com `.serialize()` (ou view montada à mão nos endpoints agregados) e **docblock declarando a regra híbrida de dinheiro**; as 14 rotas registradas na ordem literal-antes-de-`:id` de §6, com `.as('reserves.*')` e `.use([middleware.auth(), middleware.currentWorkspace()])`; artefatos do Tuyau commitados.

---

### Onda 5 — Testes da API + formatadores web (2 tarefas paralelas)

#### T11 — Spec funcional de reservas
- **Arquivos:** `api/tests/functional/reserves.spec.ts`
- **Aceite:** os 16 casos de §8.2 passam com `npm --prefix api test -- functional --files=reserves.spec.ts`.

#### T12 — Formatadores de taxa
- **Arquivos:** `web/src/lib/format.ts` (**compartilhado**) · `web/src/lib/format.test.ts`
- **Aceite:** `formatPercentBR` e `formatRateLabel` implementados com normalização de NBSP; nenhum teste existente de `format` quebra.

---

### Onda 6 — Camada de dados e componentes web (6 tarefas paralelas; arquivos disjuntos)

#### T13 — Hook da feature
- **Arquivos:** `web/src/features/reservas/useReserves.ts`
- **Aceite:** todos os tipos, as 6 keys e os 14 hooks de §7.3; invalidação sempre `void qc.invalidateQueries({ queryKey: ['reserves'] })`; zero toast; `npm --prefix web run build` passa.

#### T14 — Página + card + meta
- **Arquivos:** `ReservasPage.tsx` · `TotalGuardadoHeader.tsx` · `ReserveAccountCard.tsx` · `GoalProgressBar.tsx` · `ReservasPage.test.tsx` · `GoalProgressBar.test.tsx`
- **Aceite:** 4 estados canônicos (skeleton / erro / vazio / lista); `Tabs` controlado com painel fora; sem `overflow-y-auto` próprio; testes de §8.3 passam.

#### T15 — Diálogos de conta e CDI
- **Arquivos:** `ReserveAccountFormDialog.tsx` · `CdiRateDialog.tsx` · `ReserveAccountFormDialog.test.tsx`
- **Aceite:** criar+editar num só componente; preview ao vivo com as **três leituras** da taxa; `reset()` em `useEffect` disparado por `open`; toasts em pt-BR na camada de UI.

#### T16 — Movimentações e reconciliação
- **Arquivos:** `MovementFormDialog.tsx` · `MovementRow.tsx` · `MovementsTab.tsx` · `ReconcileDialog.tsx`
- **Aceite:** `amount` sai como **number positivo**; data default sem `toISOString()`; os dois avisos em tempo real presentes; `ReconcileDialog` pergunta o saldo do banco e mostra o delta calculado antes de confirmar.

#### T17 — Extrato e banner
- **Arquivos:** `AccountStatementDialog.tsx` · `YieldCloseBanner.tsx`
- **Aceite:** memória de cálculo renderizada por linha de `yield`; badge "CDI estimado" quando `cdiSource !== 'exact'`; yield sem ações; banner renderiza `skipped` com explicação em linguagem de família (nunca "apurar"/"vigência").

#### T18 — Simulador
- **Arquivos:** `ProjectionSimulator.tsx` · `ProjectionChart.tsx` · `ProjectionSimulator.test.tsx`
- **Aceite:** campo **dia do aporte** visível; zero request por tecla; badge de meta e curva usam a **mesma** `monthsToGoal`; boilerplate de recharts idêntico ao repo; teste de §8.3 passa.

---

### Onda 7 — Integração (1 tarefa; 4 arquivos compartilhados)

#### T19 — Painel do dashboard, rota e menu
- **Arquivos:** `web/src/features/dashboard/panels/GuardadoPanel.tsx` (novo) · `GuardadoPanel.test.tsx` (novo) · `web/src/features/dashboard/DashboardPage.tsx` (**compartilhado**) · `web/src/features/dashboard/DashboardPage.test.tsx` (**compartilhado**) · `web/src/app/router.tsx` (**compartilhado**) · `web/src/app/AppLayout.tsx` (**compartilhado**)
- **Aceite:** `GuardadoPanel` **nunca** retorna `null`; `metaProgresso` convertido com `Math.round(x * 100)`; `DashboardPage.test.tsx` passa a esperar **5** tabs e ganha o `vi.mock` de `@/features/reservas/useReserves`; rota `/reservas` e item de menu **Reservas** com `PiggyBank` presentes; `npm --prefix web run test`, `build` e `lint` passam.

---

## 10. Arquivos

**Novos (API)**
`api/database/migrations/1782800000001_create_reserve_accounts_table.ts` · `…0002_create_reserve_rate_periods_table.ts` · `…0003_create_reserve_movements_table.ts` · `…0004_create_cdi_rates_table.ts`
`api/app/models/{reserve_account,reserve_rate_period,reserve_movement,cdi_rate}.ts`
`api/app/modules/reserves/{interest,rate_service,cdi_defaults,ledger_service,yield_service,reserve_account_service,reserve_movement_service,reserve_validator,reserves_controller}.ts`
`api/tests/unit/reserve_interest.spec.ts` · `api/tests/functional/reserves.spec.ts`

**Novos (Web)** — os 18 arquivos de §7.2 + os 6 testes de §8.3.

**Alterados**
`api/database/schema.ts` (**regenerado**) · `api/start/routes.ts` · `api/.adonisjs/**` (regenerado)
`web/src/lib/format.ts` (+ `format.test.ts`) · `web/src/app/router.tsx` · `web/src/app/AppLayout.tsx` · `web/src/features/dashboard/DashboardPage.tsx` (+ `DashboardPage.test.tsx`)

**Removidos:** nenhum.

**Sem mudança:** `items`, `categories`, `monthly_entries`, `dashboard_service.ts`, `workspace_service.ts`, `current_workspace_middleware.ts`, `handler.ts`, `queryClient`, `PullToRefresh`.

---

## 11. Critérios de aceite (v1)

- [ ] Cadastrar uma caixinha **com saldo que já existe no banco** funciona no primeiro minuto de uso (campo "saldo inicial" → movimento `opening`, fora de "aportado no mês").
- [ ] Múltiplas caixinhas com taxas diferentes; total consolidado correto na página e no dashboard.
- [ ] Depósitos e saques datados aparecem no extrato com saldo corrente linha a linha.
- [ ] Rendimento é composto: o rendimento de um mês entra na base do mês seguinte (verificado contra §5.10).
- [ ] Aporte no meio do mês rende pro-rata; a UI explica a regra ("o dinheiro rende a partir do dia em que entra") e o extrato imprime o peso.
- [ ] `10% a.a.` mostra `≈0,7974% a.m.` no formulário — nunca `0,8333%`.
- [ ] `100% do CDI` com CDI de 14,90% a.a. produz exatamente 14,90% a.a. de rendimento composto (teste de propriedade verde).
- [ ] `110% do CDI` é cadastrável (sem teto de 100%).
- [ ] O painel "Guardado" mostra **rendimento parcial > R$ 0,00 já no dia 2 do mês**, rotulado "parcial · até hoje".
- [ ] Rodar a apuração 3× seguidas não muda nenhum centavo.
- [ ] Uma conta com 2 meses de saldo zero para de pedir apuração depois do primeiro `close` (banner converge).
- [ ] "Acertar saldo com o banco" existe, pergunta o saldo do extrato e calcula o ajuste sozinho — e o ajuste conta como **rendimento**, não como aporte.
- [ ] Não existe nenhuma tela que peça ao usuário para calcular uma diferença de cabeça.
- [ ] Simulador responde a cada tecla sem round-trip; o badge "faltam N meses" e a curva do gráfico **concordam** em todos os casos.
- [ ] Trocar o "dia do aporte" no simulador muda visivelmente o resultado (não é premissa escondida).
- [ ] Acesso cross-workspace devolve **404** em todas as rotas com `:id`.
- [ ] `npm --prefix api test`, `npm --prefix api run typecheck`, `npm --prefix web run test`, `build` e `lint` todos verdes.

---

## 12. Fora de escopo (YAGNI)

- **IR e IOF.** Um CDB/LCI real tem tributação regressiva e IOF nos 30 primeiros dias. Fora da v1; a divergência é absorvida pela reconciliação.
- **Capitalização diária em 252 dias úteis com calendário ANBIMA.** Exigiria feriados bancários móveis com manutenção anual.
- **Integração com o SGS do Banco Central** para buscar o CDI. Sem chave, sem job, sem dependência de rede; o usuário digita 1 número por ano.
- **Cron/scheduler.** Não existe no repositório. A apuração é `POST` idempotente, disparado automaticamente pelo cliente ao montar a tela.
- **Endpoints dedicados de histórico de vigências de taxa** (`GET/POST /accounts/:id/rates`). A tabela existe e é gerenciada implicitamente por `POST`/`PATCH /accounts`; o histórico é visível na memória de cálculo do extrato.
- **Transferência entre caixinhas** (hoje = um saque + um depósito).
- **Aporte recorrente automático** e **ponte com `monthly_entries`** (marcar um lançamento como pago gerando aporte).
- **Partida dobrada, contrapartida em conta corrente, marcação a mercado.**
- **Multi-workspace / múltiplas metas por conta / histórico de metas revisadas.**
- **Dark mode** (o `index.css` só define `:root`; não adicionar variantes `dark:`).

---

## 13. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Ordem de rotas: `reserves/summary` capturado como `:id` → `NaN` → 404 confuso | Ordem canônica de §6 documentada em comentário no grupo + teste funcional #15 |
| `api/database/schema.ts` defasado → models não compilam | T1 é uma tarefa única que roda `migration:run` e commita `schema.ts` + `api/.adonisjs/**` junto com as migrations |
| `new Date('2026-07-01')` em UTC-3 vira 30/06 → movimento no mês errado e peso pro-rata errado | `@column.date()` serializa `'YYYY-MM-DD'`; toda construção usa `DateTime.fromISO`/`fromObject`; default "hoje" no web via `getFullYear/getMonth/getDate`; teste explícito com `occurredOn = '2026-07-01'` |
| Drift entre `api/.../interest.ts` e `web/.../interest.ts` → o simulador promete um número que a apuração nunca entrega | Cabeçalho de espelho nos dois arquivos + **V1..V12 idênticos nos dois testes** + regra de PR: mudança de fórmula toca os dois no mesmo commit |
| Alguém "otimiza" arredondando a base ou a taxa antes do produto → quebra a idempotência | Teste funcional #8 roda `close` 3× e assevera bytes idênticos; `yield_base` é `decimal(14,6)` |
| Confusão percentual × fração (fator 100 no rendimento) | Tabela de unidades §5.0, nomes explícitos (`rateValue` sempre %, `taxaMensalEfetiva`/`rateApplied` sempre fração), vetor V11 |
| `metaProgresso` é fração 0..1 e `ProgressRing` espera 0..100 → anel quase vazio numa meta de 43% | `Math.round(x * 100)` documentado; teste de `GuardadoPanel`; já mordeu no `ResumoPanel` |
| Backfill de 5 anos × 10 contas numa transação estoura lock wait ou o timeout de 30 s | Limite de 120 meses por chamada + teste funcional #16 com 36 meses |
| Testes rodam no **banco de dev** (`.env.test` só tem `SESSION_DRIVER=memory`); um `COMMIT` explícito vazaria yields no banco da família | Regra dura: `YieldService`/`LedgerService` **recebem o `trx` por parâmetro e nunca abrem conexão própria** |
| `DashboardPage.test.tsx` quebra com o 5º painel e com "No QueryClient set" | Ambas as correções são parte de T19, não conserto posterior |
| `CASCADE` em `reserve_movements` apaga o razão inteiro ao deletar a conta | `DELETE` só apaga de fato quando não há movimentos; com movimentos, arquiva. O `CASCADE` do banco continua ativo e está documentado |
| `UNIQUE (reserve_account_id, yield_period)` só funciona como idempotência porque o InnoDB permite múltiplos `NULL` num índice único | Comentário obrigatório na migration |
| CDI esquecido → rendimento de conta em `% do CDI` fica desatualizado sem aviso | Carry-forward + `DEFAULT_CDI_ANNUAL` + `cdiSource` no payload + badge "CDI estimado" no extrato e chip no cabeçalho da página |
| Vocabulário contábil ("apurar", "vigência", "reapuração") afastando o usuário familiar | Cópia da UI usa **"Atualizar rendimentos"**, **"Seus rendimentos estão desatualizados desde março"**, **"Acertar saldo com o banco"** — nunca os termos técnicos |
| Resíduo de arredondamento capitalizado ao longo de 10 anos | Cota superior declarada e medida (≤ **R$ 1,29** em 120 meses a 1,16% a.m.), ordens de grandeza abaixo da divergência contra o banco |

---

## 14. Roadmap pós-v1

1. **Aporte recorrente** ("todo dia 5, R$ 1.500") gerando os movimentos automaticamente — é o que remove a exigência de disciplina mensal.
2. **Ponte com `monthly_entries`**: marcar um lançamento "Guardar" como pago cria o aporte na caixinha (o parser de planilha já carrega o caso `"65 (guardado BB)"`).
3. **Transferência entre caixinhas** como operação atômica única.
4. **IR/IOF estimados** por produto (`CDB` / `LCI` / `poupança`) com tabela regressiva.
5. **Busca automática do CDI** via SGS do Banco Central, mantendo a digitação manual como fallback.
6. **Gráfico de rendimento mês a mês** por caixinha (a série já existe no razão; falta a tela).
7. **`reserve_month_closings`** como *cache* reconstruível de fechamento mensal, se o volume um dia justificar — nunca como fonte de verdade.
8. Repensar `gridClassName` do carrossel se um 6º painel entrar (`lg:grid-cols-2 xl:grid-cols-3`).