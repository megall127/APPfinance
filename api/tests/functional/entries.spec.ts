import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import MonthlyEntry from '#models/monthly_entry'
import { registerAndAuth } from './helpers.js'

test.group('Entries', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  /**
   * Upsert creates an entry, then an upsert on the same (item, year, month)
   * updates idempotently — only ONE row must exist and amount must be '264.60'.
   */
  test('upsert cria e idempotentemente atualiza o entry do mes', async ({ client, assert }) => {
    const { token } = await registerAndAuth(client, 'e1@test.com')

    const itemRes = await client
      .post('/api/v1/items')
      .bearerToken(token)
      .json({ name: 'Luz', kind: 'expense' })
    itemRes.assertStatus(201)
    const item = itemRes.body()

    // First upsert — creates entry
    const a = await client
      .post('/api/v1/entries/upsert')
      .bearerToken(token)
      .json({ itemId: item.id, year: 2026, month: 6, amount: 200 })
    a.assertStatus(200)

    // Second upsert — updates same (item, year, month)
    const b = await client
      .post('/api/v1/entries/upsert')
      .bearerToken(token)
      .json({ itemId: item.id, year: 2026, month: 6, amount: 264.6 })
    b.assertStatus(200)
    assert.equal(b.body().amount, '264.60')

    // Only ONE row must exist for (item, year, month)
    const rows = await MonthlyEntry.query()
      .where('item_id', item.id)
      .where('year', 2026)
      .where('month', 6)
    assert.equal(rows.length, 1, 'Must have exactly one row for (item, year, month)')
  })

  /**
   * toggle-paid: first toggle → 'paid' + non-null paidAt.
   * Second toggle → 'pending' + null paidAt.
   */
  test('toggle-paid alterna status e paidAt', async ({ client, assert }) => {
    const { token } = await registerAndAuth(client, 'e2@test.com')

    const itemRes = await client
      .post('/api/v1/items')
      .bearerToken(token)
      .json({ name: 'Net', kind: 'expense' })
    itemRes.assertStatus(201)
    const item = itemRes.body()

    const upsertRes = await client
      .post('/api/v1/entries/upsert')
      .bearerToken(token)
      .json({ itemId: item.id, year: 2026, month: 6, amount: 100 })
    upsertRes.assertStatus(200)
    const entryId = upsertRes.body().id

    // Toggle to paid
    const t1 = await client.post(`/api/v1/entries/${entryId}/toggle-paid`).bearerToken(token)
    t1.assertStatus(200)
    assert.equal(t1.body().status, 'paid')
    assert.exists(t1.body().paidAt, 'paidAt must be set when paid')

    // Toggle back to pending
    const t2 = await client.post(`/api/v1/entries/${entryId}/toggle-paid`).bearerToken(token)
    t2.assertStatus(200)
    assert.equal(t2.body().status, 'pending')
    assert.isNull(t2.body().paidAt, 'paidAt must be null when pending')
  })

  /**
   * monthView: returns all active items with their entry (or null) for the requested month.
   */
  test('monthView retorna itens ativos com entry ou null', async ({ client, assert }) => {
    const { token } = await registerAndAuth(client, 'e3@test.com')

    // Create two items
    const item1Res = await client
      .post('/api/v1/items')
      .bearerToken(token)
      .json({ name: 'Item A', kind: 'expense' })
    item1Res.assertStatus(201)
    const item1 = item1Res.body()

    const item2Res = await client
      .post('/api/v1/items')
      .bearerToken(token)
      .json({ name: 'Item B', kind: 'income' })
    item2Res.assertStatus(201)
    const item2 = item2Res.body()

    // Upsert entry for item1 in June 2026 only
    await client
      .post('/api/v1/entries/upsert')
      .bearerToken(token)
      .json({ itemId: item1.id, year: 2026, month: 6, amount: 300 })

    // GET monthView for June 2026
    const view = await client.get('/api/v1/entries?year=2026&month=6').bearerToken(token)
    view.assertStatus(200)

    const rows = view.body() as Array<{ item: { id: number }; entry: { amount: string } | null }>
    assert.isArray(rows)

    const row1 = rows.find((r) => Number(r.item.id) === Number(item1.id))
    const row2 = rows.find((r) => Number(r.item.id) === Number(item2.id))

    assert.exists(row1, 'item1 must appear in month view')
    assert.exists(row1?.entry, 'item1 must have an entry for June 2026')
    assert.equal(row1?.entry?.amount, '300.00')

    assert.exists(row2, 'item2 must appear in month view')
    assert.isNull(row2?.entry, 'item2 has no entry → must be null')
  })

  /**
   * PATCH /api/v1/entries/:id updates amount, status, note.
   */
  test('PATCH /api/v1/entries/:id atualiza campos', async ({ client, assert }) => {
    const { token } = await registerAndAuth(client, 'e4@test.com')

    const itemRes = await client
      .post('/api/v1/items')
      .bearerToken(token)
      .json({ name: 'Agua', kind: 'expense' })
    itemRes.assertStatus(201)
    const item = itemRes.body()

    const upsertRes = await client
      .post('/api/v1/entries/upsert')
      .bearerToken(token)
      .json({ itemId: item.id, year: 2026, month: 6, amount: 80 })
    upsertRes.assertStatus(200)
    const entryId = upsertRes.body().id

    const patchRes = await client
      .patch(`/api/v1/entries/${entryId}`)
      .bearerToken(token)
      .json({ amount: 95.5, status: 'paid', note: 'pago no app' })
    patchRes.assertStatus(200)
    assert.equal(patchRes.body().amount, '95.50')
    assert.equal(patchRes.body().status, 'paid')
    assert.equal(patchRes.body().note, 'pago no app')
  })

  /**
   * Invariant: PATCH status must keep paidAt consistent.
   * status='paid'  → paidAt non-null; status='pending' → paidAt null.
   */
  test('PATCH status gerencia paidAt (invariante paid ⟹ paidAt)', async ({ client, assert }) => {
    const { token } = await registerAndAuth(client, 'epaidat@test.com')

    const itemRes = await client
      .post('/api/v1/items')
      .bearerToken(token)
      .json({ name: 'Gas', kind: 'expense' })
    itemRes.assertStatus(201)
    const item = itemRes.body()

    const upsertRes = await client
      .post('/api/v1/entries/upsert')
      .bearerToken(token)
      .json({ itemId: item.id, year: 2026, month: 6, amount: 50 })
    upsertRes.assertStatus(200)
    const entryId = upsertRes.body().id
    // Sanity: starts pending with null paidAt
    assert.equal(upsertRes.body().status, 'pending')
    assert.isNull(upsertRes.body().paidAt)

    // PATCH to paid → paidAt must be set
    const toPaid = await client
      .patch(`/api/v1/entries/${entryId}`)
      .bearerToken(token)
      .json({ status: 'paid' })
    toPaid.assertStatus(200)
    assert.equal(toPaid.body().status, 'paid')
    assert.exists(toPaid.body().paidAt, 'paidAt must be set when PATCH status=paid')

    // PATCH back to pending → paidAt must be cleared
    const toPending = await client
      .patch(`/api/v1/entries/${entryId}`)
      .bearerToken(token)
      .json({ status: 'pending' })
    toPending.assertStatus(200)
    assert.equal(toPending.body().status, 'pending')
    assert.isNull(toPending.body().paidAt, 'paidAt must be null when PATCH status=pending')
  })

  /**
   * Invariant: upsert with status='paid' must set paidAt.
   */
  test('upsert com status=paid seta paidAt', async ({ client, assert }) => {
    const { token } = await registerAndAuth(client, 'eupaid@test.com')

    const itemRes = await client
      .post('/api/v1/items')
      .bearerToken(token)
      .json({ name: 'Seguro', kind: 'expense' })
    itemRes.assertStatus(201)
    const item = itemRes.body()

    const res = await client
      .post('/api/v1/entries/upsert')
      .bearerToken(token)
      .json({ itemId: item.id, year: 2026, month: 6, amount: 120, status: 'paid' })
    res.assertStatus(200)
    assert.equal(res.body().status, 'paid')
    assert.exists(res.body().paidAt, 'paidAt must be set when upsert status=paid')
  })

  /**
   * Cross-workspace: user B cannot upsert using A's itemId → 404 or 422.
   */
  test('cross-workspace: user B nao pode usar itemId de A no upsert', async ({
    client,
    assert,
  }) => {
    const userA = await registerAndAuth(client, 'ewA@test.com')
    const userB = await registerAndAuth(client, 'ewB@test.com')

    const itemRes = await client
      .post('/api/v1/items')
      .bearerToken(userA.token)
      .json({ name: 'A Item', kind: 'expense' })
    itemRes.assertStatus(201)
    const itemA = itemRes.body()

    const res = await client
      .post('/api/v1/entries/upsert')
      .bearerToken(userB.token)
      .json({ itemId: itemA.id, year: 2026, month: 6, amount: 100 })
    assert.isTrue(
      res.status() === 404 || res.status() === 422,
      `Expected 404 or 422, got ${res.status()}`
    )
  })

  /**
   * Cross-workspace: user B cannot toggle-paid or PATCH A's entry → 404.
   */
  test('cross-workspace: user B nao pode toggle/patch entry de A', async ({ client }) => {
    const userA = await registerAndAuth(client, 'ewC@test.com')
    const userB = await registerAndAuth(client, 'ewD@test.com')

    const itemRes = await client
      .post('/api/v1/items')
      .bearerToken(userA.token)
      .json({ name: 'A Item 2', kind: 'expense' })
    itemRes.assertStatus(201)
    const itemA = itemRes.body()

    const upsertRes = await client
      .post('/api/v1/entries/upsert')
      .bearerToken(userA.token)
      .json({ itemId: itemA.id, year: 2026, month: 7, amount: 150 })
    upsertRes.assertStatus(200)
    const entryId = upsertRes.body().id

    // B cannot toggle A's entry
    const toggleRes = await client
      .post(`/api/v1/entries/${entryId}/toggle-paid`)
      .bearerToken(userB.token)
    toggleRes.assertStatus(404)

    // B cannot PATCH A's entry
    const patchRes = await client
      .patch(`/api/v1/entries/${entryId}`)
      .bearerToken(userB.token)
      .json({ amount: 999 })
    patchRes.assertStatus(404)
  })

  /**
   * Cross-workspace: user B's monthView must NOT include user A's items.
   */
  test('cross-workspace: monthView de B nao inclui itens de A', async ({ client, assert }) => {
    const userA = await registerAndAuth(client, 'emvA@test.com')
    const userB = await registerAndAuth(client, 'emvB@test.com')

    const itemRes = await client
      .post('/api/v1/items')
      .bearerToken(userA.token)
      .json({ name: 'A Secret', kind: 'expense' })
    itemRes.assertStatus(201)
    const itemA = itemRes.body()

    const view = await client.get('/api/v1/entries?year=2026&month=6').bearerToken(userB.token)
    view.assertStatus(200)

    const rows = view.body() as Array<{ item: { id: number } }>
    const ids = rows.map((r) => Number(r.item.id))
    assert.notInclude(ids, Number(itemA.id), 'B must not see A items in monthView')
  })

  /**
   * monthView requires year + month query params → 422 if missing.
   */
  test('GET /api/v1/entries sem year/month → 422', async ({ client }) => {
    const { token } = await registerAndAuth(client, 'e5@test.com')
    const res = await client.get('/api/v1/entries').bearerToken(token)
    res.assertStatus(422)
  })

  test('installment auto-advance: toggle-paid increments installmentsPaid; reaching total sets isActive=false', async ({
    client,
    assert,
  }) => {
    const { token } = await registerAndAuth(client, 'installentry1@test.com')

    // Create an installment item: total=3, paid=0
    const itemRes = await client
      .post('/api/v1/items')
      .bearerToken(token)
      .json({ name: 'Parcelado', kind: 'expense', installmentsTotal: 3, installmentsPaid: 0 })
    itemRes.assertStatus(201)
    const itemId = (itemRes.body() as { id: number }).id

    // Create an entry for month 6/2026 (status=pending by default)
    const upsertRes = await client
      .post('/api/v1/entries/upsert')
      .bearerToken(token)
      .json({ itemId, year: 2026, month: 6, amount: 100 })
    upsertRes.assertStatus(200)
    const entryId = (upsertRes.body() as { id: number }).id

    // Toggle to paid → installmentsPaid should be 1
    const t1 = await client.post(`/api/v1/entries/${entryId}/toggle-paid`).bearerToken(token)
    t1.assertStatus(200)
    assert.equal((t1.body() as { status: string }).status, 'paid')

    // Verify the item now has installmentsPaid=1
    const list1 = await client.get('/api/v1/items').bearerToken(token)
    list1.assertStatus(200)
    const found1 = (list1.body() as Array<{ id: number; installmentsPaid: number; isActive: unknown }>)
      .find((i) => Number(i.id) === Number(itemId))
    assert.equal(found1?.installmentsPaid, 1, 'installmentsPaid should be 1 after first toggle to paid')
    assert.isOk(found1?.isActive, 'Item should be active (1 < 3)')

    // Toggle back to pending → installmentsPaid should return to 0
    const t2 = await client.post(`/api/v1/entries/${entryId}/toggle-paid`).bearerToken(token)
    t2.assertStatus(200)
    assert.equal((t2.body() as { status: string }).status, 'pending')

    const list2 = await client.get('/api/v1/items').bearerToken(token)
    const found2 = (list2.body() as Array<{ id: number; installmentsPaid: number }>)
      .find((i) => Number(i.id) === Number(itemId))
    assert.equal(found2?.installmentsPaid, 0, 'installmentsPaid should be 0 after toggle back to pending')

    // Now create 2 more entries for months 7 and 8, toggle each to paid
    // to drive installmentsPaid to 3 (= total) → quitado
    const u2 = await client
      .post('/api/v1/entries/upsert')
      .bearerToken(token)
      .json({ itemId, year: 2026, month: 7, amount: 100 })
    u2.assertStatus(200)
    const e2Id = (u2.body() as { id: number }).id

    const u3 = await client
      .post('/api/v1/entries/upsert')
      .bearerToken(token)
      .json({ itemId, year: 2026, month: 8, amount: 100 })
    u3.assertStatus(200)
    const e3Id = (u3.body() as { id: number }).id

    // Toggle entry 1 (June) to paid (again)
    await client.post(`/api/v1/entries/${entryId}/toggle-paid`).bearerToken(token)
    // Toggle entry 2 (July) to paid
    await client.post(`/api/v1/entries/${e2Id}/toggle-paid`).bearerToken(token)
    // Toggle entry 3 (August) to paid → now paid=3 = total → quitado
    await client.post(`/api/v1/entries/${e3Id}/toggle-paid`).bearerToken(token)

    const list3 = await client.get('/api/v1/items').bearerToken(token)
    const found3 = (list3.body() as Array<{ id: number; installmentsPaid: number; isActive: unknown }>)
      .find((i) => Number(i.id) === Number(itemId))
    assert.equal(found3?.installmentsPaid, 3, 'installmentsPaid should be 3 after paying 3 months')
    assert.isNotOk(found3?.isActive, 'Item should be inactive (quitado) when paid=total (3=3)')
  })
})
