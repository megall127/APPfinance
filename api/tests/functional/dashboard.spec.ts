import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { registerAndAuth } from './helpers.js'

test.group('Dashboard', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  /**
   * Monthly summary: totalDoMes, jaPago, faltaPagar, percentualPago
   */
  test('resumo do mes calcula total, pago e percentual', async ({ client, assert }) => {
    const { token } = await registerAndAuth(client, 'd1@test.com')

    const luz = (
      await client.post('/api/v1/items').bearerToken(token).json({ name: 'Luz', kind: 'expense' })
    ).body()

    const net = (
      await client
        .post('/api/v1/items')
        .bearerToken(token)
        .json({ name: 'Internet', kind: 'expense' })
    ).body()

    await client
      .post('/api/v1/entries/upsert')
      .bearerToken(token)
      .json({ itemId: luz.id, year: 2026, month: 6, amount: 200, status: 'paid' })

    await client
      .post('/api/v1/entries/upsert')
      .bearerToken(token)
      .json({ itemId: net.id, year: 2026, month: 6, amount: 100, status: 'pending' })

    const res = await client.get('/api/v1/dashboard?year=2026&month=6').bearerToken(token)
    res.assertStatus(200)

    const body = res.body()
    assert.equal(body.totalDoMes, 300)
    assert.equal(body.jaPago, 200)
    assert.equal(body.faltaPagar, 100)
    assert.closeTo(body.percentualPago, 0.6667, 0.001)
  })

  /**
   * receitas, saldo, assinaturasCartao — card_subscription does NOT count in totalDoMes
   */
  test('receitas, saldo e assinaturasCartao calculados corretamente', async ({
    client,
    assert,
  }) => {
    const { token } = await registerAndAuth(client, 'd2@test.com')

    // expense items
    const luz = (
      await client.post('/api/v1/items').bearerToken(token).json({ name: 'Luz', kind: 'expense' })
    ).body()

    const net = (
      await client
        .post('/api/v1/items')
        .bearerToken(token)
        .json({ name: 'Internet', kind: 'expense' })
    ).body()

    // income item
    const salario = (
      await client
        .post('/api/v1/items')
        .bearerToken(token)
        .json({ name: 'Salario', kind: 'income' })
    ).body()

    // card_subscription item
    const netflix = (
      await client
        .post('/api/v1/items')
        .bearerToken(token)
        .json({ name: 'Netflix', kind: 'card_subscription' })
    ).body()

    await client
      .post('/api/v1/entries/upsert')
      .bearerToken(token)
      .json({ itemId: luz.id, year: 2026, month: 6, amount: 200, status: 'paid' })

    await client
      .post('/api/v1/entries/upsert')
      .bearerToken(token)
      .json({ itemId: net.id, year: 2026, month: 6, amount: 100, status: 'pending' })

    await client
      .post('/api/v1/entries/upsert')
      .bearerToken(token)
      .json({ itemId: salario.id, year: 2026, month: 6, amount: 5000 })

    await client
      .post('/api/v1/entries/upsert')
      .bearerToken(token)
      .json({ itemId: netflix.id, year: 2026, month: 6, amount: 50 })

    const res = await client.get('/api/v1/dashboard?year=2026&month=6').bearerToken(token)
    res.assertStatus(200)

    const body = res.body()
    assert.equal(body.totalDoMes, 300, 'card_subscription must NOT be counted in totalDoMes')
    assert.equal(body.receitas, 5000)
    assert.equal(body.saldo, 5000 - 300)
    assert.equal(body.assinaturasCartao, 50)
  })

  /**
   * Gastos avulsos sao dinheiro que JA saiu — nao sao "conta paga".
   * Somados em jaPago, eles empurravam o anel de progresso para cima sem que
   * nenhum boleto tivesse sido pago ("29% pago" com tudo em aberto).
   * Ficam no totalDoMes (o dinheiro saiu) mas fora de jaPago/faltaPagar/anel,
   * que medem as CONTAS do mes, e aparecem no proprio campo gastosVariaveis.
   */
  test('gastos avulsos nao contam como conta paga no anel de progresso', async ({
    client,
    assert,
  }) => {
    const { token } = await registerAndAuth(client, 'd5@test.com')

    // Conta fixa de 2000, ainda em aberto.
    const aluguel = (
      await client
        .post('/api/v1/items')
        .bearerToken(token)
        .json({ name: 'Aluguel', kind: 'expense' })
    ).body()

    await client
      .post('/api/v1/entries/upsert')
      .bearerToken(token)
      .json({ itemId: aluguel.id, year: 2026, month: 6, amount: 2000, status: 'pending' })

    // 800 de gastos da rua no mesmo mes, via aba Gastos.
    const gasto = await client
      .post('/api/v1/variable-expenses')
      .bearerToken(token)
      .json({ amount: 800, spentOn: '2026-06-15' })
    gasto.assertStatus(201)

    const res = await client.get('/api/v1/dashboard?year=2026&month=6').bearerToken(token)
    res.assertStatus(200)

    const body = res.body()
    assert.equal(body.totalDoMes, 2800, 'o dinheiro que saiu continua no total do mes')
    assert.equal(body.gastosVariaveis, 800, 'gastos avulsos tem campo proprio')
    assert.equal(body.jaPago, 0, 'nenhuma CONTA foi paga')
    assert.equal(body.faltaPagar, 2000, 'falta o aluguel, e so ele')
    assert.strictEqual(body.percentualPago, 0, 'o anel mede contas pagas, nao gasto avulso')
    assert.equal(
      body.jaPago + body.faltaPagar + body.gastosVariaveis,
      body.totalDoMes,
      'os tres numeros precisam fechar o total'
    )
  })

  /**
   * A serie "Pago" do grafico anual usa a mesma regra do anel do Resumo, senao
   * a mesma tela mostra dois "pago" diferentes para o mesmo mes.
   */
  test('yearly: gasto avulso entra no total do mes mas nao em pago', async ({ client, assert }) => {
    const { token } = await registerAndAuth(client, 'd6@test.com')

    const aluguel = (
      await client
        .post('/api/v1/items')
        .bearerToken(token)
        .json({ name: 'Aluguel', kind: 'expense' })
    ).body()

    await client
      .post('/api/v1/entries/upsert')
      .bearerToken(token)
      .json({ itemId: aluguel.id, year: 2026, month: 6, amount: 2000, status: 'pending' })

    await client
      .post('/api/v1/variable-expenses')
      .bearerToken(token)
      .json({ amount: 800, spentOn: '2026-06-15' })

    const res = await client.get('/api/v1/dashboard/yearly?year=2026').bearerToken(token)
    res.assertStatus(200)

    const junho = res.body().months.find((m: { month: number }) => m.month === 6)
    assert.equal(junho.total, 2800, 'o gasto avulso saiu do bolso: entra no total')
    assert.equal(junho.paid, 0, '"Pago" no grafico e conta paga, igual ao anel do Resumo')
  })

  /**
   * breakdownPorCategoria: expenses grouped by category with correct totals
   */
  test('breakdownPorCategoria agrupa despesas por categoria', async ({ client, assert }) => {
    const { token } = await registerAndAuth(client, 'd3@test.com')

    // Create a category
    const catRes = await client
      .post('/api/v1/categories')
      .bearerToken(token)
      .json({ name: 'Casa', color: '#ff0000' })
    catRes.assertStatus(201)
    const cat = catRes.body()

    // Create two items in the same category
    const luz = (
      await client
        .post('/api/v1/items')
        .bearerToken(token)
        .json({ name: 'Luz', kind: 'expense', categoryId: cat.id })
    ).body()

    const agua = (
      await client
        .post('/api/v1/items')
        .bearerToken(token)
        .json({ name: 'Agua', kind: 'expense', categoryId: cat.id })
    ).body()

    await client
      .post('/api/v1/entries/upsert')
      .bearerToken(token)
      .json({ itemId: luz.id, year: 2026, month: 6, amount: 150 })

    await client
      .post('/api/v1/entries/upsert')
      .bearerToken(token)
      .json({ itemId: agua.id, year: 2026, month: 6, amount: 80 })

    const res = await client.get('/api/v1/dashboard?year=2026&month=6').bearerToken(token)
    res.assertStatus(200)

    const body = res.body()
    assert.isArray(body.breakdownPorCategoria)

    const casaBreakdown = body.breakdownPorCategoria.find(
      (b: { categoryId: number }) => b.categoryId === cat.id
    )
    assert.exists(casaBreakdown, 'breakdown must include category "Casa"')
    assert.isNumber(casaBreakdown.categoryId, 'categoryId must be a number, not a string')
    assert.strictEqual(casaBreakdown.categoryId, cat.id)
    assert.equal(casaBreakdown.name, 'Casa')
    assert.equal(casaBreakdown.color, '#ff0000')
    assert.equal(casaBreakdown.total, 230)
  })

  /**
   * Yearly endpoint: returns 12 months, correct totals, zeros for empty months
   */
  test('yearly retorna 12 meses com totais corretos', async ({ client, assert }) => {
    const { token } = await registerAndAuth(client, 'd4@test.com')

    const luz = (
      await client.post('/api/v1/items').bearerToken(token).json({ name: 'Luz', kind: 'expense' })
    ).body()

    const net = (
      await client
        .post('/api/v1/items')
        .bearerToken(token)
        .json({ name: 'Internet', kind: 'expense' })
    ).body()

    await client
      .post('/api/v1/entries/upsert')
      .bearerToken(token)
      .json({ itemId: luz.id, year: 2026, month: 6, amount: 200, status: 'paid' })

    await client
      .post('/api/v1/entries/upsert')
      .bearerToken(token)
      .json({ itemId: net.id, year: 2026, month: 6, amount: 100, status: 'pending' })

    const res = await client.get('/api/v1/dashboard/yearly?year=2026').bearerToken(token)
    res.assertStatus(200)

    const body = res.body()
    assert.isArray(body.months)
    assert.equal(body.months.length, 12, 'Must have exactly 12 months')

    // Verify month numbering starts at 1
    assert.equal(body.months[0].month, 1)
    assert.equal(body.months[11].month, 12)

    // Month 6 (index 5) must have correct totals
    const june = body.months.find((m: { month: number }) => m.month === 6)
    assert.exists(june)
    assert.equal(june.total, 300)
    assert.equal(june.paid, 200)

    // Other months must be zero
    const jan = body.months.find((m: { month: number }) => m.month === 1)
    assert.equal(jan.total, 0)
    assert.equal(jan.paid, 0)
  })

  /**
   * Cross-workspace: user B's dashboard must not include user A's data
   */
  test('cross-workspace: dashboard de B nao inclui dados de A', async ({ client, assert }) => {
    const userA = await registerAndAuth(client, 'dA@test.com')
    const userB = await registerAndAuth(client, 'dB@test.com')

    // User A creates items and entries
    const itemA = (
      await client
        .post('/api/v1/items')
        .bearerToken(userA.token)
        .json({ name: 'Luz A', kind: 'expense' })
    ).body()

    await client
      .post('/api/v1/entries/upsert')
      .bearerToken(userA.token)
      .json({ itemId: itemA.id, year: 2026, month: 6, amount: 999, status: 'paid' })

    // User B queries dashboard — must see zeros
    const res = await client.get('/api/v1/dashboard?year=2026&month=6').bearerToken(userB.token)
    res.assertStatus(200)

    const body = res.body()
    assert.equal(body.totalDoMes, 0, 'B must not see A data')
    assert.equal(body.jaPago, 0)
    assert.equal(body.receitas, 0)
    assert.equal(body.assinaturasCartao, 0)
    assert.strictEqual(body.percentualPago, 0, 'zero-guard must return 0, not NaN')

    // Yearly cross-workspace check
    const yearly = await client.get('/api/v1/dashboard/yearly?year=2026').bearerToken(userB.token)
    yearly.assertStatus(200)

    const june = yearly.body().months.find((m: { month: number }) => m.month === 6)
    assert.equal(june.total, 0, 'B yearly must not see A data')
    assert.equal(june.paid, 0)
  })
})
