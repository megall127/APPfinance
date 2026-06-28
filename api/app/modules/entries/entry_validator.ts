import vine from '@vinejs/vine'

/**
 * Validator for GET /api/v1/entries?year=&month=
 *
 * year  - required integer
 * month - required integer, 1–12
 */
export const monthViewQueryValidator = vine.compile(
  vine.object({
    year: vine.number().withoutDecimals(),
    month: vine.number().withoutDecimals().min(1).max(12),
  })
)

/**
 * Validator for POST /api/v1/entries/upsert
 *
 * itemId - required number; item must belong to the current workspace (validated in service)
 * year   - required number
 * month  - required number (1–12)
 * amount - required number (VineJS accepts both numeric strings and numbers)
 * status - optional enum ('paid' | 'pending'), defaults to 'pending' in service
 * note   - optional string
 */
export const upsertEntryValidator = vine.compile(
  vine.object({
    itemId: vine.number().withoutDecimals(),
    year: vine.number().withoutDecimals(),
    month: vine.number().withoutDecimals().min(1).max(12),
    amount: vine.number(),
    status: vine.enum(['paid', 'pending'] as const).optional(),
    note: vine.string().optional(),
  })
)

/**
 * Validator for PATCH /api/v1/entries/:id
 *
 * All fields optional — only provided fields are updated.
 * amount - optional number
 * status - optional enum ('paid' | 'pending')
 * note   - optional string
 */
export const updateEntryValidator = vine.compile(
  vine.object({
    amount: vine.number().optional(),
    status: vine.enum(['paid', 'pending'] as const).optional(),
    note: vine.string().optional(),
  })
)
