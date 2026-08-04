import { describe, it, expect } from 'vitest'
import {
  formatBRL,
  formatPercentBR,
  formatRateLabel,
  MONTHS_PT,
  parseMonthParam,
} from './format'

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

describe('formatPercentBR', () => {
  // Recebe FRACAO (0.0118757178 = 1,1876%), nunca percentual.
  it('formata a fracao com 4 casas por padrao', () => {
    expect(formatPercentBR(0.0118757178)).toBe('1,1876%')
  })
  it('respeita o numero de casas informado', () => {
    expect(formatPercentBR(0.0118757178, 2)).toBe('1,19%')
    expect(formatPercentBR(0.0085, 2)).toBe('0,85%')
    expect(formatPercentBR(0.009853, 2)).toBe('0,99%')
  })
  it('mantem os zeros a direita ate as casas pedidas', () => {
    expect(formatPercentBR(0.0085)).toBe('0,8500%')
    expect(formatPercentBR(0)).toBe('0,0000%')
  })
  it('converte taxa anual equivalente sem espaco antes do %', () => {
    const label = formatPercentBR(0.007974140429)
    expect(label).toBe('0,7974%')
    expect(label).not.toMatch(/[\u00A0\u202F]/)
  })
})

describe('formatRateLabel', () => {
  // `value` vem da API como string decimal do PERCENTUAL; `monthlyRate` e fracao.
  it('cdi mostra o percentual do CDI e a taxa mensal aproximada', () => {
    expect(formatRateLabel('cdi', '102.000000', 0.0118757178)).toBe(
      '102% do CDI · ≈1,19% a.m.'
    )
  })
  it('monthly nao repete a taxa mensal no sufixo', () => {
    expect(formatRateLabel('monthly', '0.850000', 0.0085)).toBe('0,85% a.m.')
  })
  it('yearly mostra a conversao para a.m.', () => {
    expect(formatRateLabel('yearly', '12.500000', 0.009853)).toBe(
      '12,5% a.a. · ≈0,99% a.m.'
    )
  })
  it('monthlyRate null omite o sufixo aproximado', () => {
    expect(formatRateLabel('cdi', '102.000000', null)).toBe('102% do CDI')
    expect(formatRateLabel('yearly', '12.500000', null)).toBe('12,5% a.a.')
    expect(formatRateLabel('monthly', '0.850000', null)).toBe('0,85% a.m.')
  })
  it('remove zeros a direita inuteis do valor cadastrado', () => {
    expect(formatRateLabel('cdi', '110.000000', null)).toBe('110% do CDI')
    expect(formatRateLabel('yearly', '10.000000', null)).toBe('10% a.a.')
    expect(formatRateLabel('monthly', '1.230000', null)).toBe('1,23% a.m.')
  })
})
