import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import MonthlyEntry from '#models/monthly_entry'
import { registerAndAuth } from './helpers.js'

test.group('Items CRUD', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  /**
   * Happy path: create an expense item → 201; kind filter works.
   */
  test('POST /api/v1/items → 201; GET ?kind=expense returns it; ?kind=income does not', async ({
    client,
    assert,
  }) => {
    const { token } = await registerAndAuth(client, 'item1@test.com')

    const created = await client
      .post('/api/v1/items')
      .bearerToken(token)
      .json({ name: 'Aluguel', kind: 'expense', sortOrder: 1 })

    created.assertStatus(201)
    assert.equal(created.body().name, 'Aluguel')
    assert.equal(created.body().kind, 'expense')
    const itemId = created.body().id

    // GET ?kind=expense returns the item
    const expenseList = await client.get('/api/v1/items?kind=expense').bearerToken(token)
    expenseList.assertStatus(200)
    const expenseIds = (expenseList.body() as Array<{ id: number }>).map((i) => Number(i.id))
    assert.include(expenseIds, Number(itemId))

    // GET ?kind=income does NOT return the expense item
    const incomeList = await client.get('/api/v1/items?kind=income').bearerToken(token)
    incomeList.assertStatus(200)
    const incomeIds = (incomeList.body() as Array<{ id: number }>).map((i) => Number(i.id))
    assert.notInclude(incomeIds, Number(itemId))
  })

  /**
   * Create item without kind → 422.
   */
  test('POST /api/v1/items without kind → 422', async ({ client }) => {
    const { token } = await registerAndAuth(client, 'itemnokind@test.com')

    const res = await client
      .post('/api/v1/items')
      .bearerToken(token)
      .json({ name: 'Missing Kind' })

    res.assertStatus(422)
  })

  /**
   * Create item with invalid kind → 422.
   */
  test('POST /api/v1/items with invalid kind → 422', async ({ client }) => {
    const { token } = await registerAndAuth(client, 'itembadkind@test.com')

    const res = await client
      .post('/api/v1/items')
      .bearerToken(token)
      .json({ name: 'Bad Kind', kind: 'investment' })

    res.assertStatus(422)
  })

  /**
   * Create item with valid categoryId (same workspace) → ok.
   * Create item with categoryId from ANOTHER workspace → 422 or 404, does NOT create.
   */
  test('categoryId from own workspace is accepted; categoryId from another workspace is rejected', async ({
    client,
    assert,
  }) => {
    const userA = await registerAndAuth(client, 'itemcatA@test.com')
    const userB = await registerAndAuth(client, 'itemcatB@test.com')

    // A creates a category in workspace A
    const catRes = await client
      .post('/api/v1/categories')
      .bearerToken(userA.token)
      .json({ name: 'Cat A' })
    catRes.assertStatus(201)
    const catAId = catRes.body().id

    // A creates an item with catAId → should succeed
    const okRes = await client
      .post('/api/v1/items')
      .bearerToken(userA.token)
      .json({ name: 'Item with own cat', kind: 'expense', categoryId: Number(catAId) })
    okRes.assertStatus(201)
    assert.equal(Number(okRes.body().categoryId), Number(catAId))

    // B tries to create an item using A's categoryId → must be rejected
    const rejRes = await client
      .post('/api/v1/items')
      .bearerToken(userB.token)
      .json({ name: 'Stealing cat', kind: 'expense', categoryId: Number(catAId) })

    // Must not be 201 — either 422 or 404
    assert.notEqual(rejRes.status(), 201, 'Should not create item with foreign categoryId')
    assert.isTrue(
      rejRes.status() === 422 || rejRes.status() === 404,
      `Expected 422 or 404, got ${rejRes.status()}`
    )
  })

  /**
   * PATCH guard: user A cannot reassign their own item to a categoryId that
   * belongs to workspace B. Request must be rejected and the item's categoryId
   * must remain unchanged.
   */
  test('PATCH /api/v1/items/:id with a foreign-workspace categoryId is rejected and does not mutate', async ({
    client,
    assert,
  }) => {
    const userA = await registerAndAuth(client, 'itempatchcatA@test.com')
    const userB = await registerAndAuth(client, 'itempatchcatB@test.com')

    // B creates a category in workspace B
    const catBRes = await client
      .post('/api/v1/categories')
      .bearerToken(userB.token)
      .json({ name: 'Cat B' })
    catBRes.assertStatus(201)
    const catBId = catBRes.body().id

    // A creates an item in workspace A (no category)
    const created = await client
      .post('/api/v1/items')
      .bearerToken(userA.token)
      .json({ name: 'A Item', kind: 'expense' })
    created.assertStatus(201)
    const itemId = created.body().id

    // A tries to PATCH their item using B's categoryId → must be rejected
    const patchRes = await client
      .patch(`/api/v1/items/${itemId}`)
      .bearerToken(userA.token)
      .json({ categoryId: Number(catBId) })

    assert.notEqual(patchRes.status(), 200, 'Should not accept foreign categoryId on PATCH')
    assert.isTrue(
      patchRes.status() === 422 || patchRes.status() === 404,
      `Expected 422 or 404, got ${patchRes.status()}`
    )

    // The item's categoryId must remain unchanged (still null)
    const list = await client.get('/api/v1/items').bearerToken(userA.token)
    const found = (list.body() as Array<{ id: number; categoryId: number | null }>).find(
      (i) => Number(i.id) === Number(itemId)
    )
    assert.isNotOk(found?.categoryId, 'categoryId must not have been changed to a foreign value')
  })

  /**
   * Query validation: an invalid ?kind value is rejected with 422
   * rather than silently returning an empty list.
   */
  test('GET /api/v1/items?kind=bogus → 422', async ({ client }) => {
    const { token } = await registerAndAuth(client, 'itembadquery@test.com')

    const res = await client.get('/api/v1/items?kind=bogus').bearerToken(token)
    res.assertStatus(422)
  })

  /**
   * Cross-workspace isolation: User B cannot GET, PATCH, or DELETE User A's items.
   */
  test('items are isolated per workspace — cross-workspace access yields 404', async ({
    client,
    assert,
  }) => {
    const userA = await registerAndAuth(client, 'itemisoA@test.com')
    const userB = await registerAndAuth(client, 'itemisoB@test.com')

    // A creates an item
    const created = await client
      .post('/api/v1/items')
      .bearerToken(userA.token)
      .json({ name: 'A Only', kind: 'income' })
    created.assertStatus(201)
    const itemId = created.body().id

    // B's item list must NOT include A's item
    const listB = await client.get('/api/v1/items').bearerToken(userB.token)
    listB.assertStatus(200)
    const bIds = (listB.body() as Array<{ id: number }>).map((i) => Number(i.id))
    assert.notInclude(bIds, Number(itemId), 'B must not see A item in their list')

    // B cannot PATCH A's item
    const patchRes = await client
      .patch(`/api/v1/items/${itemId}`)
      .bearerToken(userB.token)
      .json({ name: 'Hacked' })
    patchRes.assertStatus(404)

    // B cannot DELETE A's item
    const deleteRes = await client.delete(`/api/v1/items/${itemId}`).bearerToken(userB.token)
    deleteRes.assertStatus(404)
  })

  /**
   * DELETE on item with NO monthly_entries → hard delete.
   */
  test('DELETE /api/v1/items/:id removes item when no monthly_entries exist', async ({
    client,
    assert,
  }) => {
    const { token } = await registerAndAuth(client, 'itemdel@test.com')

    const created = await client
      .post('/api/v1/items')
      .bearerToken(token)
      .json({ name: 'No Entries', kind: 'expense' })
    created.assertStatus(201)
    const itemId = created.body().id

    const del = await client.delete(`/api/v1/items/${itemId}`).bearerToken(token)
    del.assertStatus(200)
    assert.deepEqual(del.body(), { deactivated: false, deleted: true })

    // Item must no longer appear in list
    const list = await client.get('/api/v1/items').bearerToken(token)
    const ids = (list.body() as Array<{ id: number }>).map((i) => Number(i.id))
    assert.notInclude(ids, Number(itemId))
  })

  /**
   * DELETE on item WITH monthly_entries → deactivates (is_active=false), NOT deleted.
   */
  test('DELETE /api/v1/items/:id deactivates item when monthly_entries exist', async ({
    client,
    assert,
  }) => {
    const { token, workspace } = await registerAndAuth(client, 'itemdeact@test.com')

    const created = await client
      .post('/api/v1/items')
      .bearerToken(token)
      .json({ name: 'Has Entries', kind: 'expense' })
    created.assertStatus(201)
    const itemId = created.body().id

    // Create a monthly entry directly via model
    await MonthlyEntry.create({
      workspaceId: Number(workspace.id),
      itemId: Number(itemId),
      year: 2026,
      month: 6,
      amount: '100.00',
      status: 'pending',
    })

    const del = await client.delete(`/api/v1/items/${itemId}`).bearerToken(token)
    del.assertStatus(200)
    assert.deepEqual(del.body(), { deactivated: true, deleted: false })

    // Item still present in list (is_active=false)
    const list = await client.get('/api/v1/items').bearerToken(token)
    const ids = (list.body() as Array<{ id: number }>).map((i) => Number(i.id))
    assert.include(ids, Number(itemId))

    const found = (list.body() as Array<{ id: number; isActive: boolean | number }>).find(
      (i) => Number(i.id) === Number(itemId)
    )
    // SQLite serializes booleans as 0/1
    assert.isNotOk(found?.isActive, 'Item must be deactivated (is_active = false/0)')
  })

  /**
   * PATCH /api/v1/items/:id updates item fields.
   */
  test('PATCH /api/v1/items/:id updates name, sortOrder, and defaultAmount', async ({
    client,
    assert,
  }) => {
    const { token } = await registerAndAuth(client, 'itempatch@test.com')

    const created = await client
      .post('/api/v1/items')
      .bearerToken(token)
      .json({ name: 'Original', kind: 'income', sortOrder: 99 })
    created.assertStatus(201)
    const itemId = created.body().id

    const patched = await client
      .patch(`/api/v1/items/${itemId}`)
      .bearerToken(token)
      .json({ name: 'Updated', sortOrder: 5, defaultAmount: '1500.00' })
    patched.assertStatus(200)
    assert.equal(patched.body().name, 'Updated')
    assert.equal(patched.body().sortOrder, 5)
    assert.equal(patched.body().defaultAmount, '1500.00')
  })

  /**
   * GET /api/v1/items without kind filter returns all items for workspace.
   */
  test('GET /api/v1/items without kind filter returns all workspace items', async ({
    client,
    assert,
  }) => {
    const { token } = await registerAndAuth(client, 'itemall@test.com')

    await client.post('/api/v1/items').bearerToken(token).json({ name: 'Income A', kind: 'income' })
    await client.post('/api/v1/items').bearerToken(token).json({ name: 'Expense B', kind: 'expense' })
    await client
      .post('/api/v1/items')
      .bearerToken(token)
      .json({ name: 'Sub C', kind: 'card_subscription' })

    const list = await client.get('/api/v1/items').bearerToken(token)
    list.assertStatus(200)
    assert.isAtLeast(list.body().length, 3)
  })

  /**
   * GET /api/v1/items without token → 401.
   */
  test('GET /api/v1/items without token → 401', async ({ client }) => {
    const res = await client.get('/api/v1/items')
    res.assertStatus(401)
  })

  test('POST /api/v1/items with installments → persists installmentsTotal and installmentsPaid', async ({
    client,
    assert,
  }) => {
    const { token } = await registerAndAuth(client, 'iteminstall1@test.com')

    const res = await client
      .post('/api/v1/items')
      .bearerToken(token)
      .json({ name: 'Geladeira', kind: 'expense', installmentsTotal: 10, installmentsPaid: 4 })

    res.assertStatus(201)
    const body = res.body() as { installmentsTotal: number; installmentsPaid: number; isActive: unknown }
    assert.equal(body.installmentsTotal, 10)
    assert.equal(body.installmentsPaid, 4)
    // 4/10 → still active
    assert.isOk(body.isActive, 'Item should be active (4 < 10)')
  })

  test('POST /api/v1/items with 10/10 installments → isActive=false (quitado)', async ({
    client,
    assert,
  }) => {
    const { token } = await registerAndAuth(client, 'iteminstall2@test.com')

    const res = await client
      .post('/api/v1/items')
      .bearerToken(token)
      .json({ name: 'TV parcelada', kind: 'expense', installmentsTotal: 10, installmentsPaid: 10 })

    res.assertStatus(201)
    const body = res.body() as { installmentsTotal: number; installmentsPaid: number; isActive: unknown }
    assert.equal(body.installmentsTotal, 10)
    assert.equal(body.installmentsPaid, 10)
    // 10/10 → quitado → inactive
    assert.isNotOk(body.isActive, 'Item should be inactive (quitado) when paid=total')
  })
})
