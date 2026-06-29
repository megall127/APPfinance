import vine from '@vinejs/vine'

/**
 * Validator for POST /api/v1/items
 *
 * name          - required, non-empty
 * kind          - required, one of income | expense | card_subscription
 * categoryId    - optional, validated against the workspace in the service layer
 * defaultAmount - optional decimal string (VineJS coerces numbers to strings)
 * isActive      - optional boolean
 * sortOrder     - optional integer position
 */
export const createItemValidator = vine.compile(
  vine.object({
    name: vine.string().minLength(1),
    kind: vine.enum(['income', 'expense', 'card_subscription']),
    categoryId: vine.number().optional(),
    defaultAmount: vine
      .string()
      .regex(/^\d+(\.\d+)?$/)
      .optional(),
    isActive: vine.boolean().optional(),
    sortOrder: vine.number().optional(),
    installmentsTotal: vine.number().withoutDecimals().positive().optional(),
    installmentsPaid: vine.number().withoutDecimals().min(0).optional(),
  })
)

/**
 * Validator for the GET /api/v1/items query string.
 *
 * kind - optional; when present must be one of income | expense | card_subscription.
 * An invalid kind yields 422 instead of silently returning an empty list.
 */
export const listItemsQueryValidator = vine.compile(
  vine.object({
    kind: vine.enum(['income', 'expense', 'card_subscription']).optional(),
  })
)

/**
 * Validator for PATCH /api/v1/items/:id
 *
 * All fields optional — only provided fields are updated.
 */
export const updateItemValidator = vine.compile(
  vine.object({
    name: vine.string().minLength(1).optional(),
    kind: vine.enum(['income', 'expense', 'card_subscription']).optional(),
    categoryId: vine.number().optional(),
    defaultAmount: vine
      .string()
      .regex(/^\d+(\.\d+)?$/)
      .optional(),
    isActive: vine.boolean().optional(),
    sortOrder: vine.number().optional(),
    installmentsTotal: vine.number().withoutDecimals().positive().optional(),
    installmentsPaid: vine.number().withoutDecimals().min(0).optional(),
  })
)
