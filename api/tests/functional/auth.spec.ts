import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'

test.group('Auth – register / login / me / logout', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('POST /api/v1/auth/register → 201 with user.email, token.value, workspace.id', async ({
    client,
    assert,
  }) => {
    const response = await client.post('/api/v1/auth/register').json({
      fullName: 'Test User',
      email: 'register@example.com',
      password: 'secret1234',
    })

    response.assertStatus(201)

    const body = response.body()
    assert.equal(body.user.email, 'register@example.com')
    assert.isString(body.token.value)
    assert.isNotEmpty(body.token.value)
    assert.exists(body.workspace.id)
    assert.notProperty(body.user, 'password')
  })

  test('POST /api/v1/auth/login → 200 with token.value and workspace.id', async ({
    client,
    assert,
  }) => {
    // Seed: register first to create user + workspace
    await client.post('/api/v1/auth/register').json({
      fullName: 'Login User',
      email: 'login@example.com',
      password: 'secret1234',
    })

    const response = await client.post('/api/v1/auth/login').json({
      email: 'login@example.com',
      password: 'secret1234',
    })

    response.assertStatus(200)

    const body = response.body()
    assert.equal(body.user.email, 'login@example.com')
    assert.isString(body.token.value)
    assert.isNotEmpty(body.token.value)
    assert.exists(body.workspace.id)
  })

  test('GET /api/v1/auth/me without token → 401', async ({ client }) => {
    const response = await client.get('/api/v1/auth/me')
    response.assertStatus(401)
  })

  test('POST /api/v1/auth/logout with valid token → { revoked: true }', async ({
    client,
    assert,
  }) => {
    // Register to get a token
    const regRes = await client.post('/api/v1/auth/register').json({
      fullName: 'Logout User',
      email: 'logout@example.com',
      password: 'secret1234',
    })
    const tokenValue = regRes.body().token.value

    const response = await client
      .post('/api/v1/auth/logout')
      .header('Authorization', `Bearer ${tokenValue}`)

    response.assertStatus(200)
    assert.deepEqual(response.body(), { revoked: true })
  })
})
