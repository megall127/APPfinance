import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import { registerAndAuth } from './helpers.js'

/**
 * Reserves — savings accounts, signed movement ledger, monthly yield accrual.
 *
 * The yield tests pin the worked example of §5.10 of the design doc:
 * "Reserva de emergência", 102% of a 14.90% a.y. CDI → i = 0.0118757178 a.m.,
 * opened 2026-04-10 with R$ 10,000.00.
 *
 *   2026-04  base 7,000.000000   → R$  83.13  → balance 10,083.13
 *   2026-05  base 11,389.581613  → R$ 135.26  → balance 11,718.39
 *   2026-06  base 12,285.056667  → R$ 145.89  → balance 11,364.28
 *
 * Those months are in the past relative to no real clock: `closeThrough` clamps
 * the target to "last month", so the helper below always closes through a period
 * that is safely in the past for the machine running the suite.
 */

/** Anchor months used by the worked example — all comfortably in the past. */
const OPENED_AT = '2026-04-10'
const CLOSE_YEAR = 2026
const CLOSE_MONTH = 6

/** Creates the §5.10 account; returns its id as a number. */
async function createExampleAccount(client: Parameters<typeof registerAndAuth>[0], token: string) {
  const res = await client.post('/api/v1/reserves/accounts').bearerToken(token).json({
    name: 'Reserva de emergência',
    institution: 'Nubank',
    openedAt: OPENED_AT,
    rateKind: 'cdi',
    rateValue: 102,
    saldoInicial: 10000,
    goalAmount: 30000,
  })
  res.assertStatus(201)
  return Number(res.body().id)
}

/**
 * True when the machine's clock is late enough for `closeThrough` to reach
 * CLOSE_YEAR/CLOSE_MONTH (the target is clamped to the previous month).
 * Guards the yield assertions instead of letting them fail on a back-dated clock.
 */
function canCloseExampleMonths() {
  const now = DateTime.now()
  return now.year * 12 + now.month > CLOSE_YEAR * 12 + CLOSE_MONTH
}

test.group('Reservas — contas', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('POST /reserves/accounts → 201 com vigência de taxa e movimento de abertura', async ({
    client,
    assert,
  }) => {
    const { token } = await registerAndAuth(client, 'reserve-create@test.com')
    const id = await createExampleAccount(client, token)

    const list = await client.get('/api/v1/reserves/accounts').bearerToken(token)
    list.assertStatus(200)

    const rows = list.body() as Array<Record<string, any>>
    const account = rows.find((r) => Number(r.id) === id)
    assert.isDefined(account)
    // saldoInicial virou um movimento `opening`, então o saldo já nasce cheio.
    assert.equal(account!.saldo, 10000)
    assert.equal(account!.saldoInicial, 10000)
    // A vigência de taxa foi criada junto (§6.3).
    assert.equal(account!.rate.kind, 'cdi')
    assert.equal(Number(account!.rate.value), 102)
    // decimal do banco → STRING (§1.3)
    assert.isString(account!.goalAmount)
  })

  test('POST /reserves/accounts com nome vazio ou taxa inválida → 422', async ({ client }) => {
    const { token } = await registerAndAuth(client, 'reserve-422@test.com')

    const semNome = await client
      .post('/api/v1/reserves/accounts')
      .bearerToken(token)
      .json({ name: '', openedAt: OPENED_AT, rateKind: 'monthly', rateValue: 0.85 })
    semNome.assertStatus(422)

    const taxaInvalida = await client
      .post('/api/v1/reserves/accounts')
      .bearerToken(token)
      .json({ name: 'Viagem', openedAt: OPENED_AT, rateKind: 'diario', rateValue: 1 })
    taxaInvalida.assertStatus(422)
  })

  test('110% do CDI é aceito — não existe teto de 100%', async ({ client, assert }) => {
    const { token } = await registerAndAuth(client, 'reserve-110@test.com')

    const res = await client
      .post('/api/v1/reserves/accounts')
      .bearerToken(token)
      .json({ name: 'CDB', openedAt: OPENED_AT, rateKind: 'cdi', rateValue: 110 })

    res.assertStatus(201)
    assert.equal(Number(res.body().rate.value), 110)
  })

  test('GET /reserves/accounts sem token → 401', async ({ client }) => {
    const res = await client.get('/api/v1/reserves/accounts')
    res.assertStatus(401)
  })

  test('isolamento entre workspaces: B não lê nem escreve na caixinha de A', async ({
    client,
    assert,
  }) => {
    const a = await registerAndAuth(client, 'reserve-iso-a@test.com')
    const b = await registerAndAuth(client, 'reserve-iso-b@test.com')
    const id = await createExampleAccount(client, a.token)

    const listaDeB = await client.get('/api/v1/reserves/accounts').bearerToken(b.token)
    listaDeB.assertStatus(200)
    const idsDeB = (listaDeB.body() as Array<{ id: string }>).map((r) => Number(r.id))
    assert.notInclude(idsDeB, id)

    const patch = await client
      .patch(`/api/v1/reserves/accounts/${id}`)
      .bearerToken(b.token)
      .json({ name: 'Sequestrada' })
    patch.assertStatus(404)

    const destroy = await client.delete(`/api/v1/reserves/accounts/${id}`).bearerToken(b.token)
    destroy.assertStatus(404)

    const statement = await client
      .get(`/api/v1/reserves/accounts/${id}/statement`)
      .bearerToken(b.token)
    statement.assertStatus(404)
  })

  test('DELETE apaga quando não há movimentos e arquiva quando há', async ({ client, assert }) => {
    const { token } = await registerAndAuth(client, 'reserve-delete@test.com')

    // Sem saldo inicial ⇒ nenhum movimento ⇒ exclusão de verdade.
    const vazia = await client
      .post('/api/v1/reserves/accounts')
      .bearerToken(token)
      .json({ name: 'Vazia', openedAt: OPENED_AT, rateKind: 'monthly', rateValue: 0.5 })
    vazia.assertStatus(201)

    const apagada = await client
      .delete(`/api/v1/reserves/accounts/${Number(vazia.body().id)}`)
      .bearerToken(token)
    apagada.assertStatus(200)
    assert.isOk(apagada.body().deleted)
    assert.isNotOk(apagada.body().archived)

    // Com movimento de abertura ⇒ arquiva.
    const comMovimento = await createExampleAccount(client, token)
    const arquivada = await client
      .delete(`/api/v1/reserves/accounts/${comMovimento}`)
      .bearerToken(token)
    arquivada.assertStatus(200)
    assert.isOk(arquivada.body().archived)
    assert.isNotOk(arquivada.body().deleted)

    // E some da listagem padrão.
    const lista = await client.get('/api/v1/reserves/accounts').bearerToken(token)
    const ids = (lista.body() as Array<{ id: string }>).map((r) => Number(r.id))
    assert.notInclude(ids, comMovimento)
  })
})

test.group('Reservas — movimentações', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('depósito soma e saque grava valor NEGATIVO', async ({ client, assert }) => {
    const { token } = await registerAndAuth(client, 'reserve-mov@test.com')
    const accountId = await createExampleAccount(client, token)

    const deposito = await client
      .post('/api/v1/reserves/movements')
      .bearerToken(token)
      .json({ accountId, kind: 'deposit', occurredOn: '2026-05-05', amount: 1500 })
    deposito.assertStatus(201)
    assert.equal(deposito.body().saldoDaConta, 11500)

    const saque = await client.post('/api/v1/reserves/movements').bearerToken(token).json({
      accountId,
      kind: 'withdrawal',
      occurredOn: '2026-06-20',
      amount: 200,
      description: 'Farmácia',
    })
    saque.assertStatus(201)
    // `amount` vem de coluna decimal → STRING assinada (§1.3).
    assert.equal(saque.body().amount, '-200.00')
    assert.equal(saque.body().signedAmount, -200)
    assert.equal(saque.body().saldoDaConta, 11300)
  })

  test('POST /reserves/movements com kind="yield" → 422', async ({ client }) => {
    const { token } = await registerAndAuth(client, 'reserve-mov-yield@test.com')
    const accountId = await createExampleAccount(client, token)

    const res = await client
      .post('/api/v1/reserves/movements')
      .bearerToken(token)
      .json({ accountId, kind: 'yield', occurredOn: '2026-05-31', amount: 10 })

    res.assertStatus(422)
  })

  test('saldo negativo é permitido e sinalizado, nunca bloqueado', async ({ client, assert }) => {
    const { token } = await registerAndAuth(client, 'reserve-negativo@test.com')
    const accountId = await createExampleAccount(client, token)

    const res = await client
      .post('/api/v1/reserves/movements')
      .bearerToken(token)
      .json({ accountId, kind: 'withdrawal', occurredOn: '2026-05-10', amount: 99999 })

    res.assertStatus(201)
    assert.isOk(res.body().saldoNegativo)
  })

  test('reconciliação cria ajuste e o ajuste conta como RENDIMENTO', async ({ client, assert }) => {
    const { token } = await registerAndAuth(client, 'reserve-reconcile@test.com')
    const accountId = await createExampleAccount(client, token)

    const res = await client
      .post(`/api/v1/reserves/accounts/${accountId}/reconcile`)
      .bearerToken(token)
      .json({ balance: 10012.4, occurredOn: '2026-06-30' })

    res.assertStatus(200)
    assert.isOk(res.body().adjusted)
    assert.closeTo(res.body().delta, 12.4, 0.001)
    assert.equal(res.body().saldoAtual, 10012.4)

    const lista = await client.get('/api/v1/reserves/accounts').bearerToken(token)
    const account = (lista.body() as Array<Record<string, any>>).find(
      (r) => Number(r.id) === accountId
    )!
    // O delta entra em rendimento, NÃO em principal (§6.7).
    assert.closeTo(account.totalRendimento, 12.4, 0.001)
    assert.equal(account.totalDepositado, 0)

    // Reconciliar de novo com o mesmo saldo é no-op.
    const denovo = await client
      .post(`/api/v1/reserves/accounts/${accountId}/reconcile`)
      .bearerToken(token)
      .json({ balance: 10012.4, occurredOn: '2026-06-30' })
    denovo.assertStatus(200)
    assert.isNotOk(denovo.body().adjusted)
  })
})

test.group('Reservas — apuração de rendimento', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('apura os 3 meses do exemplo §5.10 com os valores exatos', async ({ client, assert }) => {
    if (!canCloseExampleMonths()) return

    const { token } = await registerAndAuth(client, 'reserve-yield@test.com')
    const accountId = await createExampleAccount(client, token)

    for (const mov of [
      { occurredOn: '2026-05-05', kind: 'deposit', amount: 1500 },
      { occurredOn: '2026-06-05', kind: 'deposit', amount: 1500 },
      { occurredOn: '2026-06-20', kind: 'withdrawal', amount: 2000 },
    ]) {
      const res = await client
        .post('/api/v1/reserves/movements')
        .bearerToken(token)
        .json({ accountId, ...mov })
      res.assertStatus(201)
    }

    const close = await client
      .post('/api/v1/reserves/yield/close')
      .bearerToken(token)
      .json({ year: CLOSE_YEAR, month: CLOSE_MONTH, accountId })
    close.assertStatus(200)
    assert.equal(close.body().throughPeriod, '2026-06')

    const rendimentos = await client
      .get(`/api/v1/reserves/movements?accountId=${accountId}&kind=yield`)
      .bearerToken(token)
    rendimentos.assertStatus(200)

    const porMes = new Map(
      (rendimentos.body() as Array<{ occurredOn: string; amount: string }>).map((r) => [
        r.occurredOn.slice(0, 7),
        r.amount,
      ])
    )
    assert.equal(porMes.get('2026-04'), '83.13')
    assert.equal(porMes.get('2026-05'), '135.26')
    assert.equal(porMes.get('2026-06'), '145.89')

    const lista = await client.get('/api/v1/reserves/accounts').bearerToken(token)
    const account = (lista.body() as Array<Record<string, any>>).find(
      (r) => Number(r.id) === accountId
    )!
    assert.closeTo(account.saldo, 11364.28, 0.001)
  })

  test('rodar a apuração 3× seguidas não muda um centavo', async ({ client, assert }) => {
    if (!canCloseExampleMonths()) return

    const { token } = await registerAndAuth(client, 'reserve-idempotente@test.com')
    const accountId = await createExampleAccount(client, token)

    const primeira = await client
      .post('/api/v1/reserves/yield/close')
      .bearerToken(token)
      .json({ year: CLOSE_YEAR, month: CLOSE_MONTH, accountId })
    primeira.assertStatus(200)
    assert.isAbove(primeira.body().created, 0)

    const snapshot = async () => {
      const res = await client
        .get(`/api/v1/reserves/movements?accountId=${accountId}&kind=yield`)
        .bearerToken(token)
      return JSON.stringify(
        (res.body() as Array<{ occurredOn: string; amount: string }>).map((r) => [
          r.occurredOn,
          r.amount,
        ])
      )
    }
    const depoisDaPrimeira = await snapshot()

    for (let i = 0; i < 2; i++) {
      const repeticao = await client
        .post('/api/v1/reserves/yield/close')
        .bearerToken(token)
        .json({ year: CLOSE_YEAR, month: CLOSE_MONTH, accountId })
      repeticao.assertStatus(200)
      assert.equal(repeticao.body().created, 0)
      assert.equal(repeticao.body().updated, 0)
    }

    assert.equal(await snapshot(), depoisDaPrimeira)
  })

  test('editar o passado e reapurar recalcula os meses seguintes', async ({ client, assert }) => {
    if (!canCloseExampleMonths()) return

    const { token } = await registerAndAuth(client, 'reserve-retroativo@test.com')
    const accountId = await createExampleAccount(client, token)

    const deposito = await client
      .post('/api/v1/reserves/movements')
      .bearerToken(token)
      .json({ accountId, kind: 'deposit', occurredOn: '2026-05-05', amount: 1500 })
    deposito.assertStatus(201)

    await client
      .post('/api/v1/reserves/yield/close')
      .bearerToken(token)
      .json({ year: CLOSE_YEAR, month: CLOSE_MONTH, accountId })

    const antes = await client.get('/api/v1/reserves/accounts').bearerToken(token)
    const saldoAntes = (antes.body() as Array<Record<string, any>>).find(
      (r) => Number(r.id) === accountId
    )!.saldo

    // Apagar o depósito antigo sinaliza que os rendimentos mudaram...
    const remocao = await client
      .delete(`/api/v1/reserves/movements/${Number(deposito.body().id)}`)
      .bearerToken(token)
    remocao.assertStatus(200)
    assert.isOk(remocao.body().recalcularSugerido)

    // ...e reapurar reescreve os meses seguintes para baixo.
    await client
      .post('/api/v1/reserves/yield/close')
      .bearerToken(token)
      .json({ year: CLOSE_YEAR, month: CLOSE_MONTH, accountId })

    const depois = await client.get('/api/v1/reserves/accounts').bearerToken(token)
    const saldoDepois = (depois.body() as Array<Record<string, any>>).find(
      (r) => Number(r.id) === accountId
    )!.saldo
    assert.isBelow(saldoDepois, saldoAntes)
  })

  test('PATCH e DELETE de um rendimento → 404', async ({ client, assert }) => {
    if (!canCloseExampleMonths()) return

    const { token } = await registerAndAuth(client, 'reserve-yield-imutavel@test.com')
    const accountId = await createExampleAccount(client, token)

    await client
      .post('/api/v1/reserves/yield/close')
      .bearerToken(token)
      .json({ year: CLOSE_YEAR, month: CLOSE_MONTH, accountId })

    const rendimentos = await client
      .get(`/api/v1/reserves/movements?accountId=${accountId}&kind=yield`)
      .bearerToken(token)
    const yieldId = Number((rendimentos.body() as Array<{ id: string }>)[0].id)
    assert.isAbove(yieldId, 0)

    const patch = await client
      .patch(`/api/v1/reserves/movements/${yieldId}`)
      .bearerToken(token)
      .json({ amount: 999 })
    patch.assertStatus(404)

    const destroy = await client.delete(`/api/v1/reserves/movements/${yieldId}`).bearerToken(token)
    destroy.assertStatus(404)
  })

  test('caixinha sem saldo: close não cria nada e o banner para de pedir', async ({
    client,
    assert,
  }) => {
    if (!canCloseExampleMonths()) return

    const { token } = await registerAndAuth(client, 'reserve-sem-saldo@test.com')
    const criada = await client
      .post('/api/v1/reserves/accounts')
      .bearerToken(token)
      .json({ name: 'Zerada', openedAt: OPENED_AT, rateKind: 'monthly', rateValue: 0.85 })
    criada.assertStatus(201)

    const close = await client
      .post('/api/v1/reserves/yield/close')
      .bearerToken(token)
      .json({ year: CLOSE_YEAR, month: CLOSE_MONTH })
    close.assertStatus(200)
    assert.equal(close.body().created, 0)
    assert.isAbove((close.body().skipped as unknown[]).length, 0)

    // `last_closed_period` — e não "existe linha de yield?" — é o que faz o
    // banner convergir mesmo quando nada foi creditado.
    const summary = await client.get('/api/v1/reserves/summary').bearerToken(token)
    summary.assertStatus(200)
    assert.isNotOk(summary.body().apuracao.pendente)
  })

  test('backfill de 36 meses roda dentro do tempo da suíte', async ({ client, assert }) => {
    const { token } = await registerAndAuth(client, 'reserve-backfill@test.com')
    const inicio = DateTime.now().minus({ months: 37 }).startOf('month')

    const criada = await client
      .post('/api/v1/reserves/accounts')
      .bearerToken(token)
      .json({
        name: 'Longa',
        openedAt: inicio.toFormat('yyyy-MM-dd'),
        rateKind: 'monthly',
        rateValue: 0.85,
        saldoInicial: 10000,
      })
    criada.assertStatus(201)

    const close = await client.post('/api/v1/reserves/yield/close').bearerToken(token).json({})
    close.assertStatus(200)
    assert.isAbove(close.body().created, 30)
  })
})

test.group('Reservas — CDI, extrato e consolidado', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('sem linha de CDI a apuração acontece com a taxa padrão', async ({ client, assert }) => {
    const { token } = await registerAndAuth(client, 'reserve-cdi-default@test.com')
    await createExampleAccount(client, token)

    const cdi = await client.get('/api/v1/reserves/cdi').bearerToken(token)
    cdi.assertStatus(200)
    assert.equal(cdi.body().vigenteHoje.source, 'default')
    assert.isNumber(cdi.body().vigenteHoje.annualRate)
  })

  test('PUT /reserves/cdi grava a vigência e informa quantas caixinhas seguem o CDI', async ({
    client,
    assert,
  }) => {
    const { token } = await registerAndAuth(client, 'reserve-cdi-put@test.com')
    await createExampleAccount(client, token)

    const res = await client
      .put('/api/v1/reserves/cdi')
      .bearerToken(token)
      .json({ year: 2026, month: 7, annualRate: 15 })

    res.assertStatus(200)
    // decimal(9,6) do banco → STRING (§1.3)
    assert.equal(res.body().annualRate, '15.000000')
    assert.equal(res.body().contasEmCdi, 1)

    // PUT é idempotente: o mesmo corpo duas vezes deixa o mesmo estado.
    const denovo = await client
      .put('/api/v1/reserves/cdi')
      .bearerToken(token)
      .json({ year: 2026, month: 7, annualRate: 15 })
    denovo.assertStatus(200)
    assert.equal(Number(denovo.body().id), Number(res.body().id))
  })

  test('extrato traz saldo corrente e marca o rendimento como não editável', async ({
    client,
    assert,
  }) => {
    const { token } = await registerAndAuth(client, 'reserve-extrato@test.com')
    const accountId = await createExampleAccount(client, token)

    await client
      .post('/api/v1/reserves/movements')
      .bearerToken(token)
      .json({ accountId, kind: 'deposit', occurredOn: '2026-05-05', amount: 1500 })

    const res = await client
      .get(`/api/v1/reserves/accounts/${accountId}/statement?year=2026`)
      .bearerToken(token)

    res.assertStatus(200)
    assert.equal(res.body().saldoFinal, 11500)

    const linhas = res.body().movements as Array<Record<string, any>>
    assert.isAbove(linhas.length, 0)
    for (const linha of linhas) {
      assert.equal(linha.editavel, linha.kind !== 'yield')
      assert.isNumber(linha.saldoApos)
      assert.isString(linha.amount)
    }
  })

  test('GET /reserves/summary responde 200 e NÃO é capturada como /accounts/:id', async ({
    client,
    assert,
  }) => {
    const { token } = await registerAndAuth(client, 'reserve-summary@test.com')
    await createExampleAccount(client, token)

    const res = await client.get('/api/v1/reserves/summary').bearerToken(token)

    // Se `reserves/summary` fosse casada como `:id`, `Number('summary')` viraria
    // NaN e a resposta seria um 404 incompreensível (§6, ordem das rotas).
    res.assertStatus(200)
    assert.equal(res.body().contasAtivas, 1)
    assert.equal(res.body().totalGuardado, 10000)
    assert.property(res.body(), 'apuracao')
    assert.isArray(res.body().evolucao12m)
  })
})
