import { describe, it, expect } from 'vitest'
import { formatBRL, MONTHS_PT, parseMonthParam } from './format'

describe('formatBRL', () => {
  it('formata em reais', () => {
    expect(formatBRL(1234.5)).toBe('R$ 1.234,50')
  })
  it('trata zero', () => {
    expect(formatBRL(0)).toBe('R$ 0,00')
  })
  it('formata numero inteiro', () => {
    expect(formatBRL(1000)).toBe('R$ 1.000,00')
  })
  it('arredonda corretamente', () => {
    expect(formatBRL(0.999)).toBe('R$ 1,00')
  })
})

describe('MONTHS_PT', () => {
  it('tem 12 meses', () => {
    expect(MONTHS_PT).toHaveLength(12)
  })
  it('comeca em Jan', () => {
    expect(MONTHS_PT[0]).toBe('Jan')
  })
  it('termina em Dez', () => {
    expect(MONTHS_PT[11]).toBe('Dez')
  })
})

describe('parseMonthParam', () => {
  // parseMonthParam returns a 0-indexed month (1-indexed param minus 1).
  it('null retorna o mes atual', () => {
    expect(parseMonthParam(null)).toBe(new Date().getMonth())
  })
  it('undefined retorna o mes atual', () => {
    expect(parseMonthParam(undefined)).toBe(new Date().getMonth())
  })
  it("'3' retorna 2 (marco, 0-indexed)", () => {
    expect(parseMonthParam('3')).toBe(2)
  })
  it("'1' retorna 0 e '12' retorna 11", () => {
    expect(parseMonthParam('1')).toBe(0)
    expect(parseMonthParam('12')).toBe(11)
  })
  it('valor fora do intervalo retorna o mes atual', () => {
    expect(parseMonthParam('13')).toBe(new Date().getMonth())
    expect(parseMonthParam('0')).toBe(new Date().getMonth())
    expect(parseMonthParam('abc')).toBe(new Date().getMonth())
  })
})
