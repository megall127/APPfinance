import vine from '@vinejs/vine'

/**
 * Validator for GET /api/v1/dashboard?year=&month=
 */
export const monthSummaryQueryValidator = vine.compile(
  vine.object({
    year: vine.number().withoutDecimals().min(2000).max(2100),
    month: vine.number().withoutDecimals().min(1).max(12),
  })
)

/**
 * Validator for GET /api/v1/dashboard/yearly?year=
 */
export const yearlyQueryValidator = vine.compile(
  vine.object({
    year: vine.number().withoutDecimals().min(2000).max(2100),
  })
)
