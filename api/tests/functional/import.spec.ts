import { test } from '@japa/runner'
import { fileURLToPath } from 'node:url'
import testUtils from '@adonisjs/core/services/test_utils'
import Item from '#models/item'
import MonthlyEntry from '#models/monthly_entry'
import { registerAndAuth } from './helpers.js'

const FIXTURE = fileURLToPath(new URL('../fixtures/planilha.xlsx', import.meta.url))

type YearSummary = { year: number; itemCount: number; entryCount: number }

test.group('Import (.xlsx → preview → commit)', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  /**
   * Preview parses the real spreadsheet: at least one year, and 2026 has items + entries.
   */
  test('POST /import/preview reads years, items and entries from the spreadsheet', async ({
    client,
    assert,
  }) => {
    const { token } = await registerAndAuth(client, 'imp-preview@test.com')

    const res = await client.post('/api/v1/import/preview').bearerToken(token).file('file', FIXTURE)

    res.assertStatus(200)
    const years = res.body().years as YearSummary[]
    assert.isAtLeast(years.length, 1)

    const y2026 = years.find((y) => y.year === 2026)
    assert.isDefined(y2026, '2026 block should be parsed')
    assert.isAbove(y2026!.itemCount, 0)
    assert.isAbove(y2026!.entryCount, 0)
  })

  /**
   * Commit writes items + entries, is idempotent, and carries the 2026 paid status.
   */
  test('POST /import/commit persists items + entries, idempotently', async ({ client, assert }) => {
    const { token, workspace } = await registerAndAuth(client, 'imp-commit@test.com')
    const wsId = Number(workspace.id)

    // First commit
    const first = await client
      .post('/api/v1/import/commit')
      .bearerToken(token)
      .file('file', FIXTURE)
    first.assertStatus(200)
    assert.isAbove(first.body().itemCount, 0)
    assert.isAbove(first.body().entryCount, 0)

    const itemsAfterFirst = await Item.query().where('workspace_id', wsId)
    const entriesAfterFirst = await MonthlyEntry.query().where('workspace_id', wsId)
    assert.isAbove(itemsAfterFirst.length, 0)
    assert.isAbove(entriesAfterFirst.length, 0)

    // A well-known imported item is present (via GET /items)
    const list = await client.get('/api/v1/items').bearerToken(token)
    list.assertStatus(200)
    const names = (list.body() as Array<{ name: string }>).map((i) => i.name)
    assert.include(names, 'Internet')

    // A 2026 entry that was green ("Pago") in the original imports as status='paid'.
    const cartao = itemsAfterFirst.find((i) => i.name === 'Cartão' && i.kind === 'expense')
    assert.isDefined(cartao, 'Cartão expense item should exist')
    const cartaoJan = await MonthlyEntry.query()
      .where('workspace_id', wsId)
      .where('item_id', Number(cartao!.id))
      .where('year', 2026)
      .where('month', 1)
      .first()
    assert.isNotNull(cartaoJan, 'Cartão 2026/Jan entry should exist')
    assert.equal(cartaoJan!.status, 'paid')

    // Second commit with the same file must NOT duplicate rows.
    const second = await client
      .post('/api/v1/import/commit')
      .bearerToken(token)
      .file('file', FIXTURE)
    second.assertStatus(200)

    const itemsAfterSecond = await Item.query().where('workspace_id', wsId)
    const entriesAfterSecond = await MonthlyEntry.query().where('workspace_id', wsId)
    assert.equal(itemsAfterSecond.length, itemsAfterFirst.length, 'item count must be stable')
    assert.equal(entriesAfterSecond.length, entriesAfterFirst.length, 'entry count must be stable')
  })

  /**
   * Auth guard: the import routes require a bearer token.
   */
  test('POST /import/preview without token → 401', async ({ client }) => {
    const res = await client.post('/api/v1/import/preview').file('file', FIXTURE)
    res.assertStatus(401)
  })
})
