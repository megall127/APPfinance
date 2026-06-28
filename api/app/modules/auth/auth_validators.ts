import vine from '@vinejs/vine'

/**
 * Validator for POST /auth/register
 */
export const registerValidator = vine.compile(
  vine.object({
    // Required, at least 2 chars (C1)
    fullName: vine.string().minLength(2),
    // normalizeEmail lowercases/trims (C3); unique gives a clean 422 on a
    // duplicate registration instead of a raw DB constraint 500 (C2)
    email: vine.string().email().normalizeEmail().unique({ table: 'users', column: 'email' }),
    // minLength 8 is a DELIBERATE strengthening over the brief's 6 (m1)
    password: vine.string().minLength(8),
  })
)

/**
 * Validator for POST /auth/login
 */
export const loginValidator = vine.compile(
  vine.object({
    // normalize so it matches the value stored at registration
    email: vine.string().email().normalizeEmail(),
    password: vine.string(),
  })
)
