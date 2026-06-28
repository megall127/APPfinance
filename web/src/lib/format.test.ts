import { describe, it, expect } from 'vitest'
import { formatBRL } from './format'

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
