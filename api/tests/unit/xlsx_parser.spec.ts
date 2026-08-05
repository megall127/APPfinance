import { test } from '@japa/runner'
import { parseWorkbook, type ParsedYear } from '#modules/import/xlsx_parser'

const FIXTURE = 'tests/fixtures/planilha.xlsx'

/** Meses que o ano REALMENTE usa, segundo as despesas lancadas na planilha. */
function mesesComDespesa(year: ParsedYear): number[] {
  const meses = new Set<number>()
  for (const item of year.items) {
    if (item.kind !== 'expense') continue
    for (const entry of item.entries) meses.add(entry.month)
  }
  return [...meses].sort((a, b) => a - b)
}

function mesesDe(year: ParsedYear, kind: 'income' | 'card_subscription'): number[] {
  const meses = new Set<number>()
  for (const item of year.items) {
    if (item.kind !== kind) continue
    for (const entry of item.entries) meses.add(entry.month)
  }
  return [...meses].sort((a, b) => a - b)
}

test.group('xlsx_parser — receitas e assinaturas recorrentes', () => {
  /**
   * A planilha traz UM valor-base para salario e para cada assinatura, sem
   * dimensao de mes. Espalhar esse valor pelos 12 meses inventava receita em
   * meses que o usuario nunca preencheu: o dashboard de um mes futuro exibia
   * "Total do mes R$ 0,00" ao lado de "Receitas R$ 9.010,00" e um saldo
   * positivo fantasma.
   */
  test('receita so entra nos meses que o ano realmente usa', async ({ assert }) => {
    const wb = await parseWorkbook(FIXTURE)
    const ano2026 = wb.years.find((y) => y.year === 2026)
    assert.exists(ano2026, 'fixture precisa ter o ano de 2026')

    const ativos = mesesComDespesa(ano2026!)
    assert.deepEqual(ativos, [1, 2, 3, 4, 5], 'a planilha de 2026 vai ate maio')

    assert.deepEqual(
      mesesDe(ano2026!, 'income'),
      ativos,
      'receita nao pode existir em mes sem movimento'
    )
    assert.deepEqual(
      mesesDe(ano2026!, 'card_subscription'),
      ativos,
      'assinatura nao pode existir em mes sem movimento'
    )
  })

  /**
   * Salario e assinaturas eram grudados so no ano MAIS RECENTE. Todo ano
   * anterior abria com "Receitas R$ 0,00" e um saldo negativo do tamanho da
   * despesa inteira, como se o usuario nao tivesse ganhado nada naquele ano.
   */
  test('receita recorrente existe em todos os anos, nao so no mais recente', async ({ assert }) => {
    const wb = await parseWorkbook(FIXTURE)
    assert.isAbove(wb.years.length, 1, 'fixture precisa ter mais de um ano')

    for (const ano of wb.years) {
      const receitas = ano.items.filter((i) => i.kind === 'income')
      assert.isNotEmpty(receitas, `ano ${ano.year} ficou sem nenhuma receita`)

      assert.deepEqual(
        mesesDe(ano, 'income'),
        mesesComDespesa(ano),
        `ano ${ano.year}: receita precisa cobrir exatamente os meses usados`
      )
    }
  })

  /** 2023 comeca em fevereiro — a receita tem que respeitar isso, nao comecar em janeiro. */
  test('ano que comeca no meio nao ganha receita no mes anterior', async ({ assert }) => {
    const wb = await parseWorkbook(FIXTURE)
    const ano2023 = wb.years.find((y) => y.year === 2023)
    assert.exists(ano2023, 'fixture precisa ter o ano de 2023')

    assert.deepEqual(mesesComDespesa(ano2023!), [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    assert.notInclude(mesesDe(ano2023!, 'income'), 1, 'janeiro/2023 nao existe na planilha')
  })

  /** O valor-base continua no item, para a grade de Lancamentos sugerir. */
  test('o valor-base da receita continua em defaultAmount', async ({ assert }) => {
    const wb = await parseWorkbook(FIXTURE)
    const ano2026 = wb.years.find((y) => y.year === 2026)!
    const salario = ano2026.items.find((i) => i.kind === 'income' && /leandro/i.test(i.name))

    assert.exists(salario, 'fixture precisa ter o salario principal')
    assert.equal(salario!.defaultAmount, 7350)
  })
})
