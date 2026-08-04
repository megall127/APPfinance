import vine from '@vinejs/vine'
import { DateTime } from 'luxon'

/**
 * Validators do módulo de reservas ("Dinheiro Guardado + Rendimento", §6 do spec).
 *
 * UNIDADES (§5.0 — a fonte #1 de erro desta feature):
 *   rateValue / annualRate ... PERCENTUAL (0.85 | 12.5 | 102 | 14.9) — NUNCA fração
 *   dinheiro na entrada ...... reais como `vine.number()` (convenção de `entries`,
 *                              não a regex-string de `items`); o service converte em centavos
 *   datas .................... string `YYYY-MM-DD` (a coluna é `date`, sem fuso)
 *
 * Dinheiro entra sempre POSITIVO: quem assina o valor por `kind` é o service (§6.9).
 */

/**
 * Teto de todo campo monetário: `decimal(12,2)` satura em 9.999.999.999,99.
 * Sem isso, um erro de digitação (150000 no lugar de 1500,00, repetido) chega
 * ao INSERT e vira erro 500 em vez de um 422 explicando o problema.
 */
const MAX_MONEY = 9_999_999_999.99

/**
 * Teto de `rate_value`, que é `decimal(9,6)` e satura em 999,999999.
 * Continua sem teto de 100 — "110% do CDI" é o produto mais comum do país —,
 * mas 1000 estouraria a coluna e derrubaria a criação da conta.
 */
const MAX_RATE = 999

/**
 * Uma data que EXISTE no calendário, não só uma string com a forma certa.
 *
 * A regex sozinha aceita `2026-02-31` e `2026-13-01`; o `DateTime.fromISO`
 * dessas strings é `Invalid DateTime`, e `toFormat()` sobre ele devolve a
 * string literal "Invalid DateTime", que só falha lá no INSERT (500) — ou,
 * pior, passa silenciosamente numa comparação de competência.
 */
const isCalendarDate = vine.createRule((value: unknown, _options: undefined, field) => {
  if (typeof value !== 'string') return
  const [year, month, day] = value.split('-').map(Number)
  if (!DateTime.fromObject({ year, month, day }).isValid) {
    field.report('O campo {{ field }} deve ser uma data existente', 'calendarDate', field)
  }
})

/** `YYYY-MM-DD` bem formado E existente no calendário. */
const isoDate = () =>
  vine
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .use(isCalendarDate())

/**
 * Validator de GET /api/v1/reserves/summary?year=&month= (§6.1), via `.validate(request.qs())`.
 *
 * year  - opcional, inteiro 2000–2200; default: ano corrente
 * month - opcional, inteiro 1–12; default: mês corrente
 */
export const summaryQueryValidator = vine.compile(
  vine.object({
    year: vine.number().withoutDecimals().min(2000).max(2200).optional(),
    month: vine.number().withoutDecimals().min(1).max(12).optional(),
  })
)

/**
 * Validator de GET /api/v1/reserves/accounts?includeArchived= (§6.2).
 *
 * includeArchived - opcional; quando ausente ou `false`, contas arquivadas ficam de fora
 */
export const accountsQueryValidator = vine.compile(
  vine.object({
    includeArchived: vine.boolean().optional(),
  })
)

/**
 * Validator de POST /api/v1/reserves/accounts (§6.3).
 *
 * Cria conta + primeira vigência de taxa + (quando `saldoInicial > 0`) o movimento
 * `opening`, tudo na mesma transação.
 *
 * name                    - obrigatório, 1–120 caracteres (já trimado)
 * institution             - opcional, até 120 caracteres (banco/corretora)
 * color                   - opcional, hex de 6 dígitos com `#` (ex.: `#4CAF82`)
 * openedAt                - obrigatório, `YYYY-MM-DD`; data de abertura, IMUTÁVEL depois
 * rateKind                - obrigatório: 'monthly' | 'yearly' | 'cdi'
 * rateValue               - obrigatório, PERCENTUAL 0–999; sem teto de 100 porque
 *                           "110% do CDI" é uma taxa perfeitamente válida
 * saldoInicial            - opcional, reais >= 0; vira o movimento `kind='opening'`
 *                           datado em `openedAt` (fica fora de "aportado no mês")
 * goalAmount              - opcional, reais >= 0; meta da caixinha
 * goalDate                - opcional, `YYYY-MM-DD`; prazo da meta
 * goalMonthlyContribution - opcional, reais >= 0; aporte mensal planejado
 * sortOrder               - opcional, inteiro; posição na listagem
 */
export const createAccountValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(120),
    institution: vine.string().trim().maxLength(120).optional(),
    color: vine
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    openedAt: isoDate(),
    rateKind: vine.enum(['monthly', 'yearly', 'cdi'] as const),
    rateValue: vine.number().min(0).max(MAX_RATE),
    saldoInicial: vine.number().min(0).max(MAX_MONEY).optional(),
    goalAmount: vine.number().min(0).max(MAX_MONEY).optional(),
    goalDate: isoDate().optional(),
    goalMonthlyContribution: vine.number().min(0).max(MAX_MONEY).optional(),
    sortOrder: vine.number().withoutDecimals().optional(),
  })
)

/**
 * Validator de PATCH /api/v1/reserves/accounts/:id (§6.4).
 *
 * Mesmo conjunto de §6.3, todos opcionais e SEM `openedAt` — a data de abertura é
 * imutável (mexer nela reescreveria a base de todos os meses já apurados).
 *
 * name                    - opcional, 1–120 caracteres
 * institution             - opcional, até 120 caracteres
 * color                   - opcional, hex de 6 dígitos com `#`
 * rateKind                - opcional; junto com `rateValue` faz `updateOrCreate` da
 *                           vigência do MÊS CORRENTE (não reescreve o passado)
 * rateValue               - opcional, PERCENTUAL 0–999 (sem teto de 100)
 * saldoInicial            - opcional, reais >= 0; `updateOrCreate` do movimento `opening`
 * goalAmount              - opcional, reais >= 0
 * goalDate                - opcional, `YYYY-MM-DD`
 * goalMonthlyContribution - opcional, reais >= 0
 * sortOrder               - opcional, inteiro
 */
export const updateAccountValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(120).optional(),
    // `nullable` nos campos apagáveis: ausente = "não mexe", `null` = "apaga".
    // Sem essa distinção não existe como remover uma meta já cadastrada — o campo
    // vazio no formulário vira `undefined` e some do corpo da requisição.
    institution: vine.string().trim().maxLength(120).nullable().optional(),
    color: vine
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    rateKind: vine.enum(['monthly', 'yearly', 'cdi'] as const).optional(),
    rateValue: vine.number().min(0).max(MAX_RATE).optional(),
    saldoInicial: vine.number().min(0).max(MAX_MONEY).optional(),
    goalAmount: vine.number().min(0).max(MAX_MONEY).nullable().optional(),
    goalDate: isoDate().nullable().optional(),
    goalMonthlyContribution: vine.number().min(0).max(MAX_MONEY).nullable().optional(),
    sortOrder: vine.number().withoutDecimals().optional(),
  })
)

/**
 * Validator de GET /api/v1/reserves/accounts/:id/statement?year=&month= (§6.6).
 *
 * year  - opcional, inteiro 2000–2200
 * month - opcional, inteiro 1–12
 *
 * Sem `year`/`month` o service devolve os últimos 12 meses.
 */
export const statementQueryValidator = vine.compile(
  vine.object({
    year: vine.number().withoutDecimals().min(2000).max(2200).optional(),
    month: vine.number().withoutDecimals().min(1).max(12).optional(),
  })
)

/**
 * Validator de POST /api/v1/reserves/accounts/:id/reconcile (§6.7).
 *
 * "Quanto tem hoje na caixinha, segundo o banco?" — o service calcula
 * `delta = toCents(balance) − saldoCents(occurredOn)` e grava um `adjustment`
 * (nada é gravado quando `delta === 0`). É a ÚNICA forma de criar um ajuste.
 *
 * balance     - obrigatório, reais >= 0; o saldo REAL lido no extrato do banco
 * occurredOn  - opcional, `YYYY-MM-DD`; default: hoje
 * description - opcional, até 180 caracteres
 */
export const reconcileValidator = vine.compile(
  vine.object({
    balance: vine.number().min(0).max(MAX_MONEY),
    occurredOn: isoDate().optional(),
    description: vine.string().trim().maxLength(180).optional(),
  })
)

/**
 * Validator de GET /api/v1/reserves/movements?accountId=&kind=&from=&to=&limit= (§6.8).
 *
 * accountId - opcional, inteiro; filtra uma conta (sempre dentro do workspace atual)
 * kind      - opcional; aqui o enum é COMPLETO porque leitura pode filtrar rendimento,
 *             abertura e ajuste (a escrita, em §6.9, não pode criá-los)
 * from      - opcional, `YYYY-MM-DD`; início do intervalo (inclusivo)
 * to        - opcional, `YYYY-MM-DD`; fim do intervalo (inclusivo)
 * limit     - opcional, inteiro 1–500; default 50 no service
 */
export const movementsQueryValidator = vine.compile(
  vine.object({
    accountId: vine.number().withoutDecimals().optional(),
    kind: vine
      .enum(['opening', 'deposit', 'withdrawal', 'adjustment', 'yield'] as const)
      .optional(),
    from: isoDate().optional(),
    to: isoDate().optional(),
    limit: vine.number().withoutDecimals().min(1).max(500).optional(),
  })
)

/**
 * Validator de POST /api/v1/reserves/movements (§6.9).
 *
 * accountId   - obrigatório, inteiro; a conta é conferida com `firstOrFail()` escopado
 * kind        - obrigatório: SÓ 'deposit' | 'withdrawal'. `opening` nasce de
 *               POST/PATCH /accounts, `adjustment` de /reconcile e `yield` do
 *               `YieldService` — este enum é a garantia de que nenhum deles é
 *               alcançável por esta rota
 * occurredOn  - obrigatório, `YYYY-MM-DD`; é a data que pesa no pro-rata do mês
 * amount      - obrigatório, reais > 0 (mínimo 0,01) e SEMPRE POSITIVO; o service
 *               assina o valor: `deposit → +abs(v)`, `withdrawal → −abs(v)`
 * description - opcional, até 180 caracteres
 */
export const createMovementValidator = vine.compile(
  vine.object({
    accountId: vine.number().withoutDecimals(),
    kind: vine.enum(['deposit', 'withdrawal'] as const),
    occurredOn: isoDate(),
    amount: vine.number().min(0.01).max(MAX_MONEY),
    description: vine.string().trim().maxLength(180).optional(),
  })
)

/**
 * Validator de PATCH /api/v1/reserves/movements/:id (§6.10).
 *
 * Mesmo conjunto de §6.9, todos opcionais e SEM `accountId` — mover um lançamento
 * de conta é imutável (mudaria a base de duas contas de uma vez).
 * A query do service carrega `.whereNot('kind', 'yield')`: editar um rendimento dá 404.
 *
 * kind        - opcional: 'deposit' | 'withdrawal'
 * occurredOn  - opcional, `YYYY-MM-DD`
 * amount      - opcional, reais > 0 (mínimo 0,01) e POSITIVO; o service reassina
 * description - opcional, até 180 caracteres
 */
export const updateMovementValidator = vine.compile(
  vine.object({
    kind: vine.enum(['deposit', 'withdrawal'] as const).optional(),
    occurredOn: isoDate().optional(),
    amount: vine.number().min(0.01).max(MAX_MONEY).optional(),
    description: vine.string().trim().maxLength(180).optional(),
  })
)

/**
 * Validator de POST /api/v1/reserves/yield/close (§6.11).
 *
 * year      - opcional, inteiro 2000–2200; default: mês anterior (o alvo é clampado
 *             em `mês corrente − 1`, mês corrente nunca é apurado)
 * month     - opcional, inteiro 1–12
 * accountId - opcional, inteiro; default: todas as contas do workspace
 */
export const closeYieldValidator = vine.compile(
  vine.object({
    year: vine.number().withoutDecimals().min(2000).max(2200).optional(),
    month: vine.number().withoutDecimals().min(1).max(12).optional(),
    accountId: vine.number().withoutDecimals().optional(),
  })
)

/**
 * Validator de GET /api/v1/reserves/cdi?year= (§6.12).
 *
 * year - opcional, inteiro 2000–2200; default: ano corrente
 */
export const cdiQueryValidator = vine.compile(
  vine.object({
    year: vine.number().withoutDecimals().min(2000).max(2200).optional(),
  })
)

/**
 * Validator de PUT /api/v1/reserves/cdi (§6.12).
 *
 * year       - obrigatório, inteiro 2000–2200
 * month      - obrigatório, inteiro 1–12; a vigência vale deste mês em diante (carry-forward)
 * annualRate - obrigatório, PERCENTUAL ANUAL 0–100 (14.9 = 14,9% a.a.). O teto de 100
 *              é do CDI em si — não confundir com `rateValue`, que é "% DO CDI" e vai a 1000
 */
export const upsertCdiValidator = vine.compile(
  vine.object({
    year: vine.number().withoutDecimals().min(2000).max(2200),
    month: vine.number().withoutDecimals().min(1).max(12),
    annualRate: vine.number().min(0).max(100),
  })
)
