import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import type { ApiClient } from '@japa/api-client'
import Item from '#models/item'
import MonthlyEntry from '#models/monthly_entry'
import { registerAndAuth } from '#tests/functional/helpers'

const AUTO_SOURCE = 'variable_expenses'

function autoItem(workspaceId: number) {
  return Item.query().where('workspace_id', workspaceId).where('auto_source', AUTO_SOURCE).first()
}

function autoEntry(workspaceId: number, itemId: number, year: number, month: number) {
  return MonthlyEntry.query()
    .where('workspace_id', workspaceId)
    .where('item_id', itemId)
    .where('year', year)
    .where('month', month)
    .first()
}

test.group('Variable expenses – CRUD', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('POST cria o gasto, o item automatico e o lancamento pago', async ({ client, assert }) => {
    const { token, workspace } = await registerAndAuth(client, 've1@example.com')

    const response = await client
      .post('/api/v1/variable-expenses')
      .bearerToken(token)
      .json({ amount: 32.5, spentOn: '2026-08-04', description: 'Almoço' })

    response.assertStatus(201)
    assert.equal(Number(response.body().amount), 32.5)

    const item = await autoItem(Number(workspace.id))
    assert.isNotNull(item)
    const entry = await autoEntry(Number(workspace.id), Number(item!.id), 2026, 8)
    assert.isNotNull(entry)
    assert.equal(Number(entry!.amount), 32.5)
    assert.equal(entry!.status, 'paid')
  })

  test('um segundo gasto soma no mesmo lancamento', async ({ client, assert }) => {
    const { token, workspace } = await registerAndAuth(client, 've2@example.com')
    const post = (amount: number, spentOn: string) =>
      client.post('/api/v1/variable-expenses').bearerToken(token).json({ amount, spentOn })

    await post(32.5, '2026-08-04')
    await post(18.9, '2026-08-04')

    const item = await autoItem(Number(workspace.id))
    const entry = await autoEntry(Number(workspace.id), Number(item!.id), 2026, 8)
    assert.equal(Number(entry!.amount), 51.4)
  })

  test('PATCH do valor atualiza o lancamento', async ({ client, assert }) => {
    const { token, workspace } = await registerAndAuth(client, 've3@example.com')
    const created = await client
      .post('/api/v1/variable-expenses')
      .bearerToken(token)
      .json({ amount: 32.5, spentOn: '2026-08-04' })

    await client
      .patch(`/api/v1/variable-expenses/${created.body().id}`)
      .bearerToken(token)
      .json({ amount: 40 })

    const item = await autoItem(Number(workspace.id))
    const entry = await autoEntry(Number(workspace.id), Number(item!.id), 2026, 8)
    assert.equal(Number(entry!.amount), 40)
  })

  test('PATCH movendo a data de julho para agosto sincroniza os dois meses', async ({
    client,
    assert,
  }) => {
    const { token, workspace } = await registerAndAuth(client, 've4@example.com')
    const created = await client
      .post('/api/v1/variable-expenses')
      .bearerToken(token)
      .json({ amount: 100, spentOn: '2026-07-31' })

    await client
      .patch(`/api/v1/variable-expenses/${created.body().id}`)
      .bearerToken(token)
      .json({ spentOn: '2026-08-01' })

    const item = await autoItem(Number(workspace.id))
    assert.isNull(await autoEntry(Number(workspace.id), Number(item!.id), 2026, 7))
    const agosto = await autoEntry(Number(workspace.id), Number(item!.id), 2026, 8)
    assert.equal(Number(agosto!.amount), 100)
  })

  test('DELETE do ultimo gasto REMOVE o lancamento', async ({ client, assert }) => {
    const { token, workspace } = await registerAndAuth(client, 've5@example.com')
    const created = await client
      .post('/api/v1/variable-expenses')
      .bearerToken(token)
      .json({ amount: 32.5, spentOn: '2026-08-04' })

    const response = await client
      .delete(`/api/v1/variable-expenses/${created.body().id}`)
      .bearerToken(token)

    response.assertStatus(200)
    response.assertBodyContains({ deleted: true })

    const item = await autoItem(Number(workspace.id))
    assert.isNull(await autoEntry(Number(workspace.id), Number(item!.id), 2026, 8))
  })

  test('GET devolve total, contagem, media e quebra por categoria', async ({ client, assert }) => {
    const { token } = await registerAndAuth(client, 've6@example.com')
    const categorias = await client.get('/api/v1/categories').bearerToken(token)
    const categoryId = Number(categorias.body()[0].id)

    const post = (amount: number, spentOn: string, cat?: number) =>
      client
        .post('/api/v1/variable-expenses')
        .bearerToken(token)
        .json(cat === undefined ? { amount, spentOn } : { amount, spentOn, categoryId: cat })

    await post(30, '2026-08-04', categoryId)
    await post(20, '2026-08-03', categoryId)
    await post(50, '2026-08-02')

    const response = await client
      .get('/api/v1/variable-expenses')
      .qs({ year: 2026, month: 8 })
      .bearerToken(token)

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.total, 100)
    assert.equal(body.count, 3)
    assert.closeTo(body.average, 33.33, 0.01)
    assert.lengthOf(body.expenses, 3)
    // mais recente primeiro
    assert.equal(body.expenses[0].spentOn, '2026-08-04')

    const comCategoria = body.byCategory.find(
      (b: { categoryId: number | null }) => b.categoryId === categoryId
    )
    const semCategoria = body.byCategory.find(
      (b: { categoryId: number | null }) => b.categoryId === null
    )
    assert.equal(comCategoria.total, 50)
    assert.equal(semCategoria.total, 50)
  })

  test('GET de mes vazio devolve zeros e nao cria item', async ({ client, assert }) => {
    const { token, workspace } = await registerAndAuth(client, 've7@example.com')

    const response = await client
      .get('/api/v1/variable-expenses')
      .qs({ year: 2026, month: 8 })
      .bearerToken(token)

    response.assertStatus(200)
    assert.equal(response.body().total, 0)
    assert.equal(response.body().count, 0)
    assert.equal(response.body().average, 0)
    assert.lengthOf(response.body().expenses, 0)
    assert.isNull(await autoItem(Number(workspace.id)))
  })

  test('POST com categoria de outro workspace da 404', async ({ client }) => {
    const a = await registerAndAuth(client, 've8a@example.com')
    const b = await registerAndAuth(client, 've8b@example.com')
    const categoriasB = await client.get('/api/v1/categories').bearerToken(b.token)

    const response = await client
      .post('/api/v1/variable-expenses')
      .bearerToken(a.token)
      .json({ amount: 10, spentOn: '2026-08-04', categoryId: Number(categoriasB.body()[0].id) })

    response.assertStatus(404)
  })

  test('PATCH e DELETE de gasto de outro workspace dao 404', async ({ client }) => {
    const a = await registerAndAuth(client, 've9a@example.com')
    const b = await registerAndAuth(client, 've9b@example.com')
    const created = await client
      .post('/api/v1/variable-expenses')
      .bearerToken(a.token)
      .json({ amount: 10, spentOn: '2026-08-04' })

    const patch = await client
      .patch(`/api/v1/variable-expenses/${created.body().id}`)
      .bearerToken(b.token)
      .json({ amount: 99 })
    patch.assertStatus(404)

    const del = await client
      .delete(`/api/v1/variable-expenses/${created.body().id}`)
      .bearerToken(b.token)
    del.assertStatus(404)
  })

  test('POST recusa data com hora e valor zero', async ({ client }) => {
    const { token } = await registerAndAuth(client, 've10@example.com')

    const comHora = await client
      .post('/api/v1/variable-expenses')
      .bearerToken(token)
      .json({ amount: 10, spentOn: '2026-08-04T23:00:00.000Z' })
    comHora.assertStatus(422)

    const zero = await client
      .post('/api/v1/variable-expenses')
      .bearerToken(token)
      .json({ amount: 0, spentOn: '2026-08-04' })
    zero.assertStatus(422)
  })

  test('o total entra no dashboard como despesa paga', async ({ client, assert }) => {
    const { token } = await registerAndAuth(client, 've11@example.com')
    await client
      .post('/api/v1/variable-expenses')
      .bearerToken(token)
      .json({ amount: 32.5, spentOn: '2026-08-04' })

    const response = await client
      .get('/api/v1/dashboard')
      .qs({ year: 2026, month: 8 })
      .bearerToken(token)

    assert.equal(response.body().totalDoMes, 32.5)
    assert.equal(response.body().jaPago, 32.5)
    assert.equal(response.body().faltaPagar, 0)
  })

  test('o item automatico aparece em GET /entries do mes', async ({ client, assert }) => {
    const { token } = await registerAndAuth(client, 've12@example.com')
    await client
      .post('/api/v1/variable-expenses')
      .bearerToken(token)
      .json({ amount: 32.5, spentOn: '2026-08-04' })

    const response = await client
      .get('/api/v1/entries')
      .qs({ year: 2026, month: 8 })
      .bearerToken(token)

    const rows = response.body() as Array<{
      item: { autoSource: string | null }
      entry: { amount: string } | null
    }>
    const auto = rows.find((row) => row.item.autoSource === AUTO_SOURCE)
    assert.isDefined(auto)
    assert.equal(Number(auto!.entry!.amount), 32.5)
  })
})

test.group('Variable expenses – item automatico e somente-leitura', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  /** Cria um gasto e devolve token + o item automatico + o lancamento dele. */
  async function comGastoLancado(client: ApiClient, email: string) {
    const { token, workspace } = await registerAndAuth(client, email)
    await client
      .post('/api/v1/variable-expenses')
      .bearerToken(token)
      .json({ amount: 32.5, spentOn: '2026-08-04' })
    const item = await autoItem(Number(workspace.id))
    const entry = await autoEntry(Number(workspace.id), Number(item!.id), 2026, 8)
    return { token, workspace, item: item!, entry: entry! }
  }

  test('POST /entries/upsert no item automatico da 422', async ({ client }) => {
    const { token, item } = await comGastoLancado(client, 'lock1@example.com')

    const response = await client
      .post('/api/v1/entries/upsert')
      .bearerToken(token)
      .json({ itemId: Number(item.id), year: 2026, month: 8, amount: 999 })

    response.assertStatus(422)
  })

  test('PATCH /entries/:id do lancamento automatico da 422', async ({ client }) => {
    const { token, entry } = await comGastoLancado(client, 'lock2@example.com')

    const response = await client
      .patch(`/api/v1/entries/${entry.id}`)
      .bearerToken(token)
      .json({ amount: 999 })

    response.assertStatus(422)
  })

  test('toggle-paid do lancamento automatico da 422', async ({ client }) => {
    const { token, entry } = await comGastoLancado(client, 'lock3@example.com')

    const response = await client.post(`/api/v1/entries/${entry.id}/toggle-paid`).bearerToken(token)

    response.assertStatus(422)
  })

  test('DELETE do item automatico da 422', async ({ client }) => {
    const { token, item } = await comGastoLancado(client, 'lock4@example.com')

    const response = await client.delete(`/api/v1/items/${item.id}`).bearerToken(token)

    response.assertStatus(422)
  })

  test('PATCH mudando o kind do item automatico da 422', async ({ client }) => {
    const { token, item } = await comGastoLancado(client, 'lock5@example.com')

    const response = await client
      .patch(`/api/v1/items/${item.id}`)
      .bearerToken(token)
      .json({ kind: 'income' })

    response.assertStatus(422)
  })

  test('PATCH renomeando e categorizando o item automatico funciona', async ({
    client,
    assert,
  }) => {
    const { token, item } = await comGastoLancado(client, 'lock6@example.com')
    const categorias = await client.get('/api/v1/categories').bearerToken(token)
    const categoryId = Number(categorias.body()[0].id)

    const response = await client
      .patch(`/api/v1/items/${item.id}`)
      .bearerToken(token)
      .json({ name: 'Rolê', categoryId })

    response.assertStatus(200)
    assert.equal(response.body().name, 'Rolê')
    assert.equal(Number(response.body().categoryId), categoryId)
  })

  test('PATCH com o mesmo kind passa (nao e uma mudanca)', async ({ client }) => {
    const { token, item } = await comGastoLancado(client, 'lock7@example.com')

    const response = await client
      .patch(`/api/v1/items/${item.id}`)
      .bearerToken(token)
      .json({ kind: 'expense', name: 'Gastos da rua' })

    response.assertStatus(200)
  })

  test('itens normais continuam editaveis e deletaveis', async ({ client }) => {
    const { token } = await registerAndAuth(client, 'lock8@example.com')
    const created = await client
      .post('/api/v1/items')
      .bearerToken(token)
      .json({ name: 'Aluguel', kind: 'expense' })

    const patch = await client
      .patch(`/api/v1/items/${created.body().id}`)
      .bearerToken(token)
      .json({ kind: 'income' })
    patch.assertStatus(200)

    const del = await client.delete(`/api/v1/items/${created.body().id}`).bearerToken(token)
    del.assertStatus(200)
  })
})
