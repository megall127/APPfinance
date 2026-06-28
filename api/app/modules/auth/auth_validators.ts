import vine from '@vinejs/vine'

/**
 * Validator for POST /auth/register
 */
export const registerValidator = vine.compile(
  vine.object({
    fullName: vine.string().nullable(),
    email: vine.string().email(),
    password: vine.string().minLength(8),
  })
)

/**
 * Validator for POST /auth/login
 */
export const loginValidator = vine.compile(
  vine.object({
    email: vine.string().email(),
    password: vine.string(),
  })
)
