import { test } from '@japa/runner'
import { isZeroAmount, monthRange, toAmountString } from '#modules/variable_expenses/month_range'

test.group('monthRange', () => {
  test('devolve o primeiro e o ultimo dia do mes', ({ assert }) => {
    assert.deepEqual(monthRange(2026, 8), ['2026-08-01', '2026-08-31'])
  })

  test('fevereiro comum termina em 28', ({ assert }) => {
    assert.deepEqual(monthRange(2026, 2), ['2026-02-01', '2026-02-28'])
  })

  test('fevereiro bissexto termina em 29', ({ assert }) => {
    assert.deepEqual(monthRange(2024, 2), ['2024-02-01', '2024-02-29'])
  })

  test('dezembro nao vaza para o ano seguinte', ({ assert }) => {
    assert.deepEqual(monthRange(2026, 12), ['2026-12-01', '2026-12-31'])
  })

  test('janeiro nao vaza para o ano anterior', ({ assert }) => {
    assert.deepEqual(monthRange(2026, 1), ['2026-01-01', '2026-01-31'])
  })
})

test.group('toAmountString', () => {
  test('passa a string do SUM adiante sem tocar', ({ assert }) => {
    // O mysql2 devolve DECIMAL como string; ela ja esta no formato exato da coluna.
    assert.equal(toAmountString('487.60'), '487.60')
  })

  test('null e undefined viram zero', ({ assert }) => {
    assert.equal(toAmountString(null), '0.00')
    assert.equal(toAmountString(undefined), '0.00')
  })

  test('numero vira string com duas casas', ({ assert }) => {
    assert.equal(toAmountString(487.6), '487.60')
    assert.equal(toAmountString(0), '0.00')
  })

  test('lixo vira zero em vez de NaN', ({ assert }) => {
    assert.equal(toAmountString('abc'), '0.00')
    assert.equal(toAmountString({}), '0.00')
  })
})

test.group('isZeroAmount', () => {
  test('reconhece as varias grafias de zero', ({ assert }) => {
    assert.isTrue(isZeroAmount('0.00'))
    assert.isTrue(isZeroAmount('0'))
    assert.isTrue(isZeroAmount('0.000'))
  })

  test('nao confunde centavos com zero', ({ assert }) => {
    assert.isFalse(isZeroAmount('0.01'))
    assert.isFalse(isZeroAmount('487.60'))
  })
})
