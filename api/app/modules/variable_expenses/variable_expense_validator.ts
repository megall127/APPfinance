import vine from '@vinejs/vine'
import { DateTime } from 'luxon'

/** 'YYYY-MM-DD' e so isso: um ISO com hora escorregaria de dia por fuso. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * A regex confere o FORMATO; esta regra confere se a data EXISTE no calendario.
 * Sem ela, '2026-02-31' passa, vira um DateTime invalido, e o Lucid estoura
 * E_INVALID_DATE_COLUMN_VALUE — um 500 onde deveria ser um 422 explicativo.
 */
const dataReal = vine
  .string()
  .regex(ISO_DATE)
  .use(
    vine.createRule((value: unknown, _options, field) => {
      if (typeof value !== 'string') return
      if (DateTime.fromISO(value).isValid) return
      field.report('A data {{ field }} não existe no calendário', 'existingDate', field)
    })()
  )

/**
 * Validator para GET /api/v1/variable-expenses?year=&month=
 *
 * year  - obrigatorio
 * month - obrigatorio, 1-12
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
    spentOn: dataReal.clone(),
    description: vine.string().trim().maxLength(180).optional(),
    categoryId: vine.number().withoutDecimals().nullable().optional(),
  })
)

/**
 * Validator para PATCH /api/v1/variable-expenses/:id
 *
 * Todos os campos opcionais — so o que vier e alterado.
 * categoryId: null limpa a categoria; description: null limpa a descricao.
 */
export const updateVariableExpenseValidator = vine.compile(
  vine.object({
    amount: vine.number().positive().optional(),
    spentOn: dataReal.clone().optional(),
    description: vine.string().trim().maxLength(180).nullable().optional(),
    categoryId: vine.number().withoutDecimals().nullable().optional(),
  })
)
