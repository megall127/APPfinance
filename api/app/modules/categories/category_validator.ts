import vine from '@vinejs/vine'

/**
 * Validator for POST /api/v1/categories
 *
 * name     - required, non-empty
 * color    - optional hex color (#RRGGBB)
 * icon     - optional string identifier
 * sortOrder - optional integer position
 */
export const createCategoryValidator = vine.compile(
  vine.object({
    name: vine.string().minLength(1),
    color: vine
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .optional(),
    icon: vine.string().optional(),
    sortOrder: vine.number().optional(),
  })
)

/**
 * Validator for PATCH /api/v1/categories/:id
 *
 * All fields optional — only provided fields are updated.
 */
export const updateCategoryValidator = vine.compile(
  vine.object({
    name: vine.string().minLength(1).optional(),
    color: vine
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .optional(),
    icon: vine.string().optional(),
    sortOrder: vine.number().optional(),
  })
)
