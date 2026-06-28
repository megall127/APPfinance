import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { registerAndAuth } from './helpers.js'

test.group('Categories CRUD', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  /**
   * Happy path: create a category and list returns ≥ 7 items
   * (6 defaults provisioned at registration + 1 created here).
   */
  test('POST /api/v1/categories → 201; list returns ≥ 7 for the workspace', async ({
    client,
    assert,
  }) => {
    const { token } = await registerAndAuth(client, 'cat1@test.com')

    const created = await client
      .post('/api/v1/categories')
      .bearerToken(token)
      .json({ name: 'Lazer', color: '#F5C84C' })

    created.assertStatus(201)
    assert.equal(created.body().name, 'Lazer')
    assert.equal(created.body().color, '#F5C84C')

    const list = await client.get('/api/v1/categories').bearerToken(token)
    list.assertStatus(200)
    assert.isAtLeast(list.body().length, 7)
  })

  /**
   * Cross-workspace isolation:
   * User B should not see, update, or delete any of User A's categories.
   */
  test('categories are isolated per workspace — cross-workspace access yields 404', async ({
    client,
    assert,
  }) => {
    const userA = await registerAndAuth(client, 'catA@test.com')
    const userB = await registerAndAuth(client, 'catB@test.com')

    // A creates a category in workspace A
    const created = await client
      .post('/api/v1/categories')
      .bearerToken(userA.token)
      .json({ name: 'Workspace A only', color: '#FF0000' })

    created.assertStatus(201)
    const categoryId = created.body().id

    // B lists their own categories — should NOT include A's new category
    const listB = await client.get('/api/v1/categories').bearerToken(userB.token)
    listB.assertStatus(200)
    const bIds = (listB.body() as Array<{ id: number }>).map((c) => Number(c.id))
    assert.notInclude(bIds, Number(categoryId), 'B must not see A category in their list')

    // B cannot PATCH A's category
    const patchRes = await client
      .patch(`/api/v1/categories/${categoryId}`)
      .bearerToken(userB.token)
      .json({ name: 'Hacked' })

    patchRes.assertStatus(404)

    // B cannot DELETE A's category
    const deleteRes = await client
      .delete(`/api/v1/categories/${categoryId}`)
      .bearerToken(userB.token)

    deleteRes.assertStatus(404)
  })

  /**
   * DELETE on a category with NO items removes it from the database.
   */
  test('DELETE /api/v1/categories/:id removes category when no items are linked', async ({
    client,
    assert,
  }) => {
    const { token } = await registerAndAuth(client, 'catdel@test.com')

    const created = await client
      .post('/api/v1/categories')
      .bearerToken(token)
      .json({ name: 'To Delete' })

    created.assertStatus(201)
    const categoryId = created.body().id

    const del = await client.delete(`/api/v1/categories/${categoryId}`).bearerToken(token)
    del.assertStatus(200)
    assert.deepEqual(del.body(), { deleted: true, archived: false })

    // Category must no longer appear in the list
    const list = await client.get('/api/v1/categories').bearerToken(token)
    const ids = (list.body() as Array<{ id: number }>).map((c) => Number(c.id))
    assert.notInclude(ids, Number(categoryId))
  })

  /**
   * PATCH /api/v1/categories/:id updates the category fields.
   */
  test('PATCH /api/v1/categories/:id updates name and sortOrder', async ({ client, assert }) => {
    const { token } = await registerAndAuth(client, 'catpatch@test.com')

    const created = await client
      .post('/api/v1/categories')
      .bearerToken(token)
      .json({ name: 'Original', sortOrder: 99 })

    created.assertStatus(201)
    const categoryId = created.body().id

    const patched = await client
      .patch(`/api/v1/categories/${categoryId}`)
      .bearerToken(token)
      .json({ name: 'Updated', sortOrder: 5 })

    patched.assertStatus(200)
    assert.equal(patched.body().name, 'Updated')
    assert.equal(patched.body().sortOrder, 5)
  })

  /**
   * GET /api/v1/categories without a token yields 401.
   */
  test('GET /api/v1/categories without token → 401', async ({ client }) => {
    const res = await client.get('/api/v1/categories')
    res.assertStatus(401)
  })

  /**
   * Validator: invalid color hex is rejected with 422.
   */
  test('POST /api/v1/categories with invalid color → 422', async ({ client }) => {
    const { token } = await registerAndAuth(client, 'catbadcolor@test.com')

    const res = await client
      .post('/api/v1/categories')
      .bearerToken(token)
      .json({ name: 'Bad Color', color: 'notahex' })

    res.assertStatus(422)
  })
})
