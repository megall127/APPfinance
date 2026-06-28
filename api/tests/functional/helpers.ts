import type { ApiClient } from '@japa/api-client'

/**
 * Registers a new user and returns their token, workspace, and user data.
 * Reusable across Tasks 8-12 functional test suites.
 *
 * @param client - Japa API client
 * @param email  - Unique email for this test user
 */
export async function registerAndAuth(client: ApiClient, email: string) {
  const response = await client.post('/api/v1/auth/register').json({
    fullName: 'Tester',
    email,
    password: 'secret123',
  })

  const body = response.body()

  return {
    token: body.token.value as string,
    workspace: body.workspace as { id: number; name: string },
    user: body.user as { id: number; email: string; fullName: string },
  }
}
