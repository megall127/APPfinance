import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import User from '#models/user'
import Item from '#models/item'
import MonthlyEntry from '#models/monthly_entry'
import VariableExpense from '#models/variable_expense'
import WorkspaceService from '#modules/workspaces/workspace_service'
import EntrySyncService, { AUTO_SOURCE } from '#modules/variable_expenses/entry_sync_service'

async function makeWorkspace(email: string) {
  const user = await User.create({ fullName: 'Sync Tester', email, password: 'secret123' })
  const workspace = await new WorkspaceService().provisionForUser(user)
  return Number(workspace.id)
}

async function addExpense(workspaceId: number, spentOn: string, amount: string) {
  return VariableExpense.create({
    workspaceId,
    categoryId: null,
    spentOn: DateTime.fromISO(spentOn),
    amount,
    description: null,
  })
}

function findAutoItem(workspaceId: number) {
  return Item.query().where('workspace_id', workspaceId).where('auto_source', AUTO_SOURCE).first()
}

function findEntry(workspaceId: number, itemId: number, year: number, month: number) {
  return MonthlyEntry.query()
    .where('workspace_id', workspaceId)
    .where('item_id', itemId)
    .where('year', year)
    .where('month', month)
    .first()
}

test.group('EntrySyncService.syncMonth', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('cria o item automatico e o lancamento na primeira sincronia', async ({ assert }) => {
    const ws = await makeWorkspace('sync1@example.com')
    await addExpense(ws, '2026-08-04', '32.50')

    await new EntrySyncService().syncMonth(ws, 2026, 8)

    const item = await findAutoItem(ws)
    assert.isNotNull(item)
    assert.equal(item!.name, 'Gastos do mês')
    assert.equal(item!.kind, 'expense')
    assert.isTrue(Boolean(item!.isActive))

    const entry = await findEntry(ws, Number(item!.id), 2026, 8)
    assert.isNotNull(entry)
    assert.equal(Number(entry!.amount), 32.5)
    assert.equal(entry!.status, 'paid')
    assert.isNotNull(entry!.paidAt)
  })

  test('soma varios gastos do mesmo mes', async ({ assert }) => {
    const ws = await makeWorkspace('sync2@example.com')
    await addExpense(ws, '2026-08-04', '32.50')
    await addExpense(ws, '2026-08-04', '18.90')
    await addExpense(ws, '2026-08-03', '84.10')

    await new EntrySyncService().syncMonth(ws, 2026, 8)

    const item = await findAutoItem(ws)
    const entry = await findEntry(ws, Number(item!.id), 2026, 8)
    assert.equal(Number(entry!.amount), 135.5)
  })

  test('ignora gastos de outro mes', async ({ assert }) => {
    const ws = await makeWorkspace('sync3@example.com')
    await addExpense(ws, '2026-07-31', '100.00')
    await addExpense(ws, '2026-08-01', '25.00')

    await new EntrySyncService().syncMonth(ws, 2026, 8)

    const item = await findAutoItem(ws)
    const entry = await findEntry(ws, Number(item!.id), 2026, 8)
    assert.equal(Number(entry!.amount), 25)
  })

  test('mes sem gastos e sem item automatico nao cria nada', async ({ assert }) => {
    const ws = await makeWorkspace('sync4@example.com')

    await new EntrySyncService().syncMonth(ws, 2026, 8)

    assert.isNull(await findAutoItem(ws))
  })

  test('apagar o ultimo gasto REMOVE o lancamento, nao zera', async ({ assert }) => {
    const ws = await makeWorkspace('sync5@example.com')
    const expense = await addExpense(ws, '2026-08-04', '32.50')
    const service = new EntrySyncService()
    await service.syncMonth(ws, 2026, 8)

    const item = await findAutoItem(ws)
    assert.isNotNull(await findEntry(ws, Number(item!.id), 2026, 8))

    await expense.delete()
    await service.syncMonth(ws, 2026, 8)

    assert.isNull(await findEntry(ws, Number(item!.id), 2026, 8))
  })

  test('e idempotente: rodar duas vezes nao duplica nem muda o valor', async ({ assert }) => {
    const ws = await makeWorkspace('sync6@example.com')
    await addExpense(ws, '2026-08-04', '32.50')
    const service = new EntrySyncService()

    await service.syncMonth(ws, 2026, 8)
    await service.syncMonth(ws, 2026, 8)

    const item = await findAutoItem(ws)
    const entries = await MonthlyEntry.query()
      .where('workspace_id', ws)
      .where('item_id', Number(item!.id))
    assert.lengthOf(entries, 1)
    assert.equal(Number(entries[0].amount), 32.5)
  })

  test('reativa o item automatico que foi desativado', async ({ assert }) => {
    const ws = await makeWorkspace('sync7@example.com')
    await addExpense(ws, '2026-08-04', '32.50')
    const service = new EntrySyncService()
    await service.syncMonth(ws, 2026, 8)

    const item = await findAutoItem(ws)
    item!.isActive = false
    await item!.save()

    await addExpense(ws, '2026-08-05', '10.00')
    await service.syncMonth(ws, 2026, 8)

    const reloaded = await findAutoItem(ws)
    assert.isTrue(Boolean(reloaded!.isActive))
  })

  test('preserva o paidAt original entre sincronias', async ({ assert }) => {
    const ws = await makeWorkspace('sync8@example.com')
    await addExpense(ws, '2026-08-04', '32.50')
    const service = new EntrySyncService()
    await service.syncMonth(ws, 2026, 8)

    const item = await findAutoItem(ws)
    const first = await findEntry(ws, Number(item!.id), 2026, 8)
    const originalPaidAt = first!.paidAt!.toMillis()

    await addExpense(ws, '2026-08-05', '10.00')
    await service.syncMonth(ws, 2026, 8)

    const second = await findEntry(ws, Number(item!.id), 2026, 8)
    assert.equal(second!.paidAt!.toMillis(), originalPaidAt)
  })

  test('nao mistura workspaces', async ({ assert }) => {
    const wsA = await makeWorkspace('sync9a@example.com')
    const wsB = await makeWorkspace('sync9b@example.com')
    await addExpense(wsA, '2026-08-04', '32.50')
    await addExpense(wsB, '2026-08-04', '999.00')

    await new EntrySyncService().syncMonth(wsA, 2026, 8)

    const itemA = await findAutoItem(wsA)
    const entryA = await findEntry(wsA, Number(itemA!.id), 2026, 8)
    assert.equal(Number(entryA!.amount), 32.5)
    assert.isNull(await findAutoItem(wsB))
  })

  test('inclui os gastos do primeiro e do ultimo dia do mes', async ({ assert }) => {
    const ws = await makeWorkspace('sync12@example.com')
    await addExpense(ws, '2026-08-01', '10.00')
    await addExpense(ws, '2026-08-31', '20.00')

    await new EntrySyncService().syncMonth(ws, 2026, 8)

    const item = await findAutoItem(ws)
    const entry = await findEntry(ws, Number(item!.id), 2026, 8)
    assert.equal(Number(entry!.amount), 30)
  })
})

test.group('EntrySyncService.syncForDates', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('sincroniza os dois meses quando o gasto atravessa a virada', async ({ assert }) => {
    const ws = await makeWorkspace('sync10@example.com')
    const expense = await addExpense(ws, '2026-07-31', '100.00')
    const service = new EntrySyncService()
    await service.syncMonth(ws, 2026, 7)

    const item = await findAutoItem(ws)
    assert.equal(Number((await findEntry(ws, Number(item!.id), 2026, 7))!.amount), 100)

    // move de 31/07 para 01/08
    expense.spentOn = DateTime.fromISO('2026-08-01')
    await expense.save()
    await service.syncForDates(ws, ['2026-07-31', '2026-08-01'])

    assert.isNull(await findEntry(ws, Number(item!.id), 2026, 7))
    assert.equal(Number((await findEntry(ws, Number(item!.id), 2026, 8))!.amount), 100)
  })

  test('datas do mesmo mes sincronizam uma vez so', async ({ assert }) => {
    const ws = await makeWorkspace('sync11@example.com')
    await addExpense(ws, '2026-08-04', '32.50')

    await new EntrySyncService().syncForDates(ws, ['2026-08-04', '2026-08-20'])

    const item = await findAutoItem(ws)
    const entries = await MonthlyEntry.query()
      .where('workspace_id', ws)
      .where('item_id', Number(item!.id))
    assert.lengthOf(entries, 1)
  })

  test('ignora null, undefined e data invalida sem explodir', async ({ assert }) => {
    const ws = await makeWorkspace('sync13@example.com')
    await addExpense(ws, '2026-08-04', '32.50')

    await new EntrySyncService().syncForDates(ws, [null, undefined, 'nao-e-data', '2026-08-04'])

    const item = await findAutoItem(ws)
    assert.equal(Number((await findEntry(ws, Number(item!.id), 2026, 8))!.amount), 32.5)
  })
})
