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

  test('POST /api/v1/auth/register with a duplicate email → 422', async ({ client }) => {
    const payload = {
      fullName: 'Dup User',
      email: 'dup@example.com',
      password: 'secret1234',
    }

    const first = await client.post('/api/v1/auth/register').json(payload)
    first.assertStatus(201)

    // Same email a second time must be rejected by the validator (clean 422),
    // not surface a raw DB unique-constraint 500.
    const second = await client.post('/api/v1/auth/register').json(payload)
    second.assertStatus(422)
  })

  test('GET /api/v1/auth/me without token → 401', async ({ client }) => {
    const response = await client.get('/api/v1/auth/me')
    response.assertStatus(401)
  })

  test('GET /api/v1/auth/me with a valid token → 200 with { user, workspace }', async ({
    client,
    assert,
  }) => {
    const regRes = await client.post('/api/v1/auth/register').json({
      fullName: 'Me User',
      email: 'me@example.com',
      password: 'secret1234',
    })
    const tokenValue = regRes.body().token.value

    const response = await client
      .get('/api/v1/auth/me')
      .header('Authorization', `Bearer ${tokenValue}`)

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.user.email, 'me@example.com')
    assert.exists(body.workspace.id)
    assert.notProperty(body.user, 'password')
  })

  test('after logout the same token on GET /api/v1/auth/me → 401 (revocation)', async ({
    client,
  }) => {
    const regRes = await client.post('/api/v1/auth/register').json({
      fullName: 'Revoke User',
      email: 'revoke@example.com',
      password: 'secret1234',
    })
    const tokenValue = regRes.body().token.value

    // Token works before logout
    const before = await client
      .get('/api/v1/auth/me')
      .header('Authorization', `Bearer ${tokenValue}`)
    before.assertStatus(200)

    // Revoke it
    const logout = await client
      .post('/api/v1/auth/logout')
      .header('Authorization', `Bearer ${tokenValue}`)
    logout.assertStatus(200)

    // Same token must now be rejected — proves the delete is visible
    // within the global test transaction.
    const after = await client
      .get('/api/v1/auth/me')
      .header('Authorization', `Bearer ${tokenValue}`)
    after.assertStatus(401)
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
