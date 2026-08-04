import { describe, it, expect } from 'vitest'
import {
  toCents,
  fromCents,
  roundCents,
  weightForDay,
  effectiveMonthlyRate,
  annualEquivalent,
  weightedBaseCents,
  partialBaseCents,
  projectMonths,
  monthsToGoal,
} from './interest'

/**
 * Vetores dourados V1..V12 (§5.9 do spec) — ESPELHO de
 * api/tests/unit/reserve_interest.spec.ts. Mudou aqui, muda lá.
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Oráculo fechado da recorrência do simulador (só para teste, §5.8). */
function monthsToGoalClosedForm(input: {
  saldoInicialCents: number
  aporteCents: number
  i: number
  metaCents: number
  diaDoAporte?: number
}): number {
  const w = weightForDay(input.diaDoAporte ?? 1, 30)
  const aporteAjustado = input.aporteCents * (1 + w * input.i)
  const numerador = input.metaCents * input.i + aporteAjustado
  const denominador = input.saldoInicialCents * input.i + aporteAjustado
  return Math.log(numerador / denominador) / Math.log(1 + input.i)
}

// ── Conversões de fronteira (§5.1) ───────────────────────────────────────────

describe('conversões de fronteira', () => {
  it('converte reais em centavos inteiros, de string ou number', () => {
    expect(toCents('12693.55')).toBe(1269355)
    expect(toCents(12693.55)).toBe(1269355)
    expect(toCents('0.01')).toBe(1)
  })

  it('converte centavos de volta para reais com 2 casas', () => {
    expect(fromCents(1269355)).toBe('12693.55')
    expect(fromCents(11264)).toBe('112.64')
    expect(fromCents(0)).toBe('0.00')
  })
})

// ── V1, V1b, V2, V2b, V2c — taxa efetiva mensal (§5.2) ───────────────────────

describe('taxa efetiva mensal', () => {
  it('V1: 10% a.a. vira 0,007974140429 a.m. e volta a 10% ao ano', () => {
    const i = effectiveMonthlyRate('yearly', 10)!
    expect(i.toFixed(12)).toBe('0.007974140429')
    expect(annualEquivalent(i)).toBeCloseTo(0.1, 12)
  })

  it('V1b: a taxa proporcional (10/12) seria 10,4713% a.a. — por isso é rejeitada', () => {
    expect(annualEquivalent(10 / 12 / 100)).toBeCloseTo(0.104713, 6)
    expect(annualEquivalent(10 / 12 / 100)).not.toBeCloseTo(0.1, 4)
  })

  it('V2: 100% do CDI de 14,90% a.a. recompõe exatamente o CDI anual', () => {
    const i = effectiveMonthlyRate('cdi', 100, 14.9)!
    expect(i.toFixed(10)).toBe('0.0116415750')
    expect(Math.abs(annualEquivalent(i) - 0.149)).toBeLessThan(1e-12)
  })

  it('V2: a propriedade 21 × 12 = 252 é o que sustenta a igualdade', () => {
    expect(21 * 12).toBe(252)
  })

  it('V2b: 102% e 110% do CDI de 14,90% a.a.', () => {
    expect(effectiveMonthlyRate('cdi', 102, 14.9)!.toFixed(10)).toBe(
      '0.0118757178',
    )
    expect(effectiveMonthlyRate('cdi', 110, 14.9)!.toFixed(10)).toBe(
      '0.0128128053',
    )
  })

  it('V2b: não existe teto de 100% — 120% do CDI é uma taxa válida', () => {
    const i = effectiveMonthlyRate('cdi', 120, 14.9)!
    expect(i.toFixed(10)).toBe('0.0139853269')
    expect(annualEquivalent(i)).toBeCloseTo(0.181354, 6)
  })

  it('V2c: sem CDI resolvível a taxa é null (vira skip cdi_missing)', () => {
    expect(effectiveMonthlyRate('cdi', 100, null)).toBeNull()
    expect(effectiveMonthlyRate('cdi', 100)).toBeNull()
    expect(effectiveMonthlyRate('cdi', 100, Number.NaN)).toBeNull()
  })

  it('taxa mensal em percentual vira fração direta e valores inválidos viram 0', () => {
    expect(effectiveMonthlyRate('monthly', 0.85)).toBeCloseTo(0.0085, 12)
    expect(effectiveMonthlyRate('monthly', -1)).toBe(0)
    expect(effectiveMonthlyRate('yearly', Number.NaN)).toBe(0)
  })
})

// ── V4, V5, V6 — pesos e base ponderada (§5.3) ───────────────────────────────

describe('pesos e base ponderada', () => {
  it('V4: D=31, S₀ 1.000, depósito de 3.000 no dia 16 → base 2.548,387097', () => {
    expect(weightForDay(16, 31)).toBeCloseTo(0.51612903, 8)
    const base = weightedBaseCents({
      openingCents: 100000,
      movements: [{ day: 16, amountCents: 300000 }],
      daysInMonth: 31,
    })
    expect((base / 100).toFixed(6)).toBe('2548.387097')
    expect(roundCents(base * 0.01)).toBe(2548) // R$ 25,48
  })

  it('V5: D=30, S₀ 5.000, saque de 2.000 no dia 10 → base 3.600,000000', () => {
    expect(weightForDay(10, 30)).toBeCloseTo(0.7, 12)
    const base = weightedBaseCents({
      openingCents: 500000,
      movements: [{ day: 10, amountCents: -200000 }],
      daysInMonth: 30,
    })
    expect((base / 100).toFixed(6)).toBe('3600.000000')
    expect(roundCents(base * 0.01)).toBe(3600) // R$ 36,00
  })

  it('V6: saldo trazido é idêntico a um depósito no dia 1', () => {
    const comSaldo = weightedBaseCents({
      openingCents: 1000000,
      movements: [],
      daysInMonth: 31,
    })
    const comDeposito = weightedBaseCents({
      openingCents: 0,
      movements: [{ day: 1, amountCents: 1000000 }],
      daysInMonth: 31,
    })
    expect(comSaldo).toBe(comDeposito)
    expect(comSaldo).toBe(1000000)
  })

  it('V6: depósito e saque do mesmo dia se cancelam (peso exato em binário)', () => {
    // dia 16 de 30 → peso 15/30 = 0,5, representável em float64: cancelamento exato
    const base = weightedBaseCents({
      openingCents: 500000,
      movements: [
        { day: 16, amountCents: 123456 },
        { day: 16, amountCents: -123456 },
      ],
      daysInMonth: 30,
    })
    expect(base).toBe(500000)
  })

  it('V6: depósito e saque do mesmo dia se cancelam com peso não representável', () => {
    // dia 17 de 30 → peso 14/30 = 0,4666…: sobra um resíduo de ~1e-10 CENTAVO
    // da soma sequencial em float64, que some no roundCents do rendimento.
    const base = weightedBaseCents({
      openingCents: 500000,
      movements: [
        { day: 17, amountCents: 123456 },
        { day: 17, amountCents: -123456 },
      ],
      daysInMonth: 30,
    })
    expect(base).toBeCloseTo(500000, 6)
    expect(roundCents(base * 0.0085)).toBe(roundCents(500000 * 0.0085))
  })

  it('V6: saque no dia d mantém (d − 1)/D do valor sacado', () => {
    const D = 30
    const base = weightedBaseCents({
      openingCents: 300000,
      movements: [{ day: 11, amountCents: -100000 }],
      daysInMonth: D,
    })
    // perde (30 − 11 + 1)/30 = 0,6666… → mantém 10/30 do saque
    expect(base).toBeCloseTo(300000 - 100000 * (20 / 30), 6)
    expect(300000 - base).toBeCloseTo(100000 * (1 - 10 / 30), 6)
  })

  it('base negativa é clampada em 0 (saldo devedor não rende nem cobra juros)', () => {
    const base = weightedBaseCents({
      openingCents: 10000,
      movements: [{ day: 1, amountCents: -50000 }],
      daysInMonth: 31,
    })
    expect(base).toBe(0)
  })

  it('o dia do movimento é truncado e clampado em [1, D]', () => {
    expect(weightForDay(0, 31)).toBe(1)
    expect(weightForDay(40, 31)).toBeCloseTo(1 / 31, 12)
    expect(weightForDay(31, 31)).toBeCloseTo(1 / 31, 12)
  })
})

// ── V12, V8 — arredondamento (§5.4) ──────────────────────────────────────────

describe('arredondamento', () => {
  it('V12: roundCents é half-up simétrico', () => {
    expect(roundCents(9425.8625)).toBe(9426)
    expect(roundCents(0.5)).toBe(1)
    expect(roundCents(-0.5)).toBe(-1)
    expect(roundCents(1.5)).toBe(2)
    expect(roundCents(-1.5)).toBe(-2)
    expect(roundCents(0.4)).toBe(0)
  })

  it('V8: base de R$ 0,40 a 1,164158% a.m. rende 0,4657 centavo → 0 (skip zero_yield)', () => {
    const i = effectiveMonthlyRate('cdi', 100, 14.9)!
    const base = 40 // centavos
    expect(base * i).toBeCloseTo(0.4657, 4)
    expect(roundCents(base * i)).toBe(0)
  })
})

// ── V3 — capitalização composta (§5.5) ───────────────────────────────────────

describe('capitalização composta', () => {
  it('V3: cadeia de 3 meses com S₀ 10.000, aporte 500 no dia 1, i 0,0085, D 31', () => {
    const i = 0.0085
    const rendimentos: number[] = []
    let saldo = 1000000

    for (let mes = 1; mes <= 3; mes++) {
      const base = weightedBaseCents({
        openingCents: saldo,
        movements: [{ day: 1, amountCents: 50000 }],
        daysInMonth: 31,
      })
      const r = roundCents(base * i)
      rendimentos.push(r)
      saldo += 50000 + r
    }

    expect(rendimentos).toEqual([8925, 9426, 9931]) // 89,25 / 94,26 / 99,31
    expect(saldo).toBe(1178282) // R$ 11.782,82
    expect(fromCents(saldo)).toBe('11782.82')
  })

  it('V3: o mês 2 arredonda 9425,8625 centavos para cima', () => {
    expect(roundCents(1108925 * 0.0085)).toBe(9426)
  })
})

// ── V10 — rendimento parcial do mês corrente (§5.6) ──────────────────────────

describe('rendimento parcial', () => {
  const daysInMonth = 31
  const openingCents = 1136428 // R$ 11.364,28
  const movements = [{ day: 5, amountCents: 150000 }] // depósito de R$ 1.500,00
  const i = 0.0118757178

  it('V10: no dia 21 a base parcial é 8.520,963871 e o rendimento parcial R$ 101,19', () => {
    const base = partialBaseCents({
      openingCents,
      movements,
      daysInMonth,
      today: 21,
    })
    expect((base / 100).toFixed(6)).toBe('8520.963871')
    expect(fromCents(roundCents(base * i))).toBe('101.19')
  })

  it('V10: a base cheia do mês é 12.670,731613 e o previsto R$ 150,47', () => {
    const base = weightedBaseCents({ openingCents, movements, daysInMonth })
    expect((base / 100).toFixed(6)).toBe('12670.731613')
    expect(fromCents(roundCents(base * i))).toBe('150.47')
  })

  it('V10: em t = D a base parcial coincide com a base do mês cheio', () => {
    const parcial = partialBaseCents({
      openingCents,
      movements,
      daysInMonth,
      today: daysInMonth,
    })
    const cheia = weightedBaseCents({ openingCents, movements, daysInMonth })
    expect(parcial).toBe(cheia)
  })

  it('em t = 1 é exatamente um dia de juros sobre S₀', () => {
    const base = partialBaseCents({
      openingCents,
      movements,
      daysInMonth,
      today: 1,
    })
    expect(base).toBeCloseTo(openingCents / daysInMonth, 9)
  })

  it('movimentos futuros do mês não entram na base parcial', () => {
    const base = partialBaseCents({
      openingCents,
      movements: [{ day: 28, amountCents: 999999 }],
      daysInMonth,
      today: 21,
    })
    expect(base).toBeCloseTo((openingCents * 21) / daysInMonth, 9)
  })
})

// ── V7, V7b, V9 — projeção e meta (§5.8) ─────────────────────────────────────

describe('projeção e meta', () => {
  it('V7: 120 meses, aporte 1.000 no dia 1, i 0,008 → R$ 201.819,30', () => {
    const pontos = projectMonths({
      saldoInicialCents: 0,
      aporteCents: 100000,
      i: 0.008,
      meses: 120,
      diaDoAporte: 1,
    })
    const ultimo = pontos[pontos.length - 1]
    expect(pontos).toHaveLength(120)
    expect(ultimo.mes).toBe(120)
    expect(fromCents(ultimo.saldoCents)).toBe('201819.30')
    expect(ultimo.aportadoCents).toBe(12000000)
    expect(ultimo.rendimentoCents).toBe(ultimo.saldoCents - ultimo.aportadoCents)
  })

  it('V7: a forma fechada dá R$ 201.819,21 — drift de arredondamento ≤ R$ 0,50', () => {
    const i = 0.008
    const aporteAjustado = 100000 * (1 + weightForDay(1, 30) * i)
    const fechada = aporteAjustado * ((Math.pow(1 + i, 120) - 1) / i)
    expect((fechada / 100).toFixed(2)).toBe('201819.21')

    const pontos = projectMonths({
      saldoInicialCents: 0,
      aporteCents: 100000,
      i,
      meses: 120,
      diaDoAporte: 1,
    })
    const drift = Math.abs(pontos[119].saldoCents - fechada)
    expect(drift).toBeLessThanOrEqual(50) // ≤ R$ 0,50
  })

  it('V7b: o mesmo caso com aporte no dia 10 dá R$ 201.338,72 (R$ 480,58 a menos)', () => {
    expect(weightForDay(10, 30)).toBeCloseTo(0.7, 12)
    const dia1 = projectMonths({
      saldoInicialCents: 0,
      aporteCents: 100000,
      i: 0.008,
      meses: 120,
      diaDoAporte: 1,
    })[119]
    const dia10 = projectMonths({
      saldoInicialCents: 0,
      aporteCents: 100000,
      i: 0.008,
      meses: 120,
      diaDoAporte: 10,
    })[119]
    expect(fromCents(dia10.saldoCents)).toBe('201338.72')
    expect(fromCents(dia1.saldoCents - dia10.saldoCents)).toBe('480.58')
  })

  it('projectMonths sem diaDoAporte assume o dia 1', () => {
    const semDia = projectMonths({
      saldoInicialCents: 250000,
      aporteCents: 30000,
      i: 0.0085,
      meses: 12,
    })
    const comDia1 = projectMonths({
      saldoInicialCents: 250000,
      aporteCents: 30000,
      i: 0.0085,
      meses: 12,
      diaDoAporte: 1,
    })
    expect(semDia).toEqual(comDia1)
  })

  it('V9: monthsToGoal itera a recorrência e bate com o oráculo fechado', () => {
    const casos = [
      { saldoInicialCents: 0, aporteCents: 50000, i: 0.01, metaCents: 3000000, esperado: 47 },
      { saldoInicialCents: 0, aporteCents: 100000, i: 0.02, metaCents: 5000000, esperado: 35 },
      { saldoInicialCents: 0, aporteCents: 20000, i: 0.015, metaCents: 2000000, esperado: 61 },
      {
        saldoInicialCents: 1000000,
        aporteCents: 50000,
        i: 0.0116,
        metaCents: 3000000,
        esperado: 28,
      },
      {
        saldoInicialCents: 0,
        aporteCents: 100000,
        i: 0.008,
        metaCents: 10000000,
        diaDoAporte: 10,
        esperado: 74,
      },
    ]

    for (const { esperado, ...input } of casos) {
      expect(monthsToGoal(input)).toBe(esperado)
      expect(Math.ceil(monthsToGoalClosedForm(input))).toBe(esperado)
    }
  })

  it('V9: a forma fechada POSTECIPADA (a errada) erraria por um mês inteiro', () => {
    const postecipada = (B: number, A: number, i: number, G: number) =>
      Math.log((A + G * i) / (A + B * i)) / Math.log(1 + i)
    expect(Math.ceil(postecipada(0, 50000, 0.01, 3000000))).toBe(48)
    expect(monthsToGoal({ saldoInicialCents: 0, aporteCents: 50000, i: 0.01, metaCents: 3000000 })).toBe(47)
  })

  it('meta já atingida devolve 0 meses', () => {
    expect(
      monthsToGoal({
        saldoInicialCents: 5000000,
        aporteCents: 100000,
        i: 0.008,
        metaCents: 3000000,
      }),
    ).toBe(0)
  })

  it('sem aporte e sem taxa a meta é inalcançável (null)', () => {
    expect(
      monthsToGoal({
        saldoInicialCents: 100000,
        aporteCents: 0,
        i: 0,
        metaCents: 3000000,
      }),
    ).toBeNull()
  })

  it('mais de 600 meses (50 anos) devolve null', () => {
    expect(
      monthsToGoal({
        saldoInicialCents: 0,
        aporteCents: 100,
        i: 0.0001,
        metaCents: 100000000,
      }),
    ).toBeNull()
  })
})

// ── V11 — unidades (§5.0) ────────────────────────────────────────────────────

describe('unidades', () => {
  it('V11: 0,85% a.m. sobre R$ 10.000 é R$ 85,00 — nem R$ 8.500,00 nem R$ 0,85', () => {
    const i = effectiveMonthlyRate('monthly', 0.85)!
    const base = toCents('10000.00')
    const rendimento = roundCents(base * i)
    expect(fromCents(rendimento)).toBe('85.00')
    expect(rendimento).toBe(8500) // centavos
  })

  it('V11: rateValue é PERCENTUAL e i é FRAÇÃO 0..1', () => {
    expect(effectiveMonthlyRate('monthly', 0.85)).toBeLessThan(1)
    expect(effectiveMonthlyRate('cdi', 102, 14.9)).toBeLessThan(1)
    expect(effectiveMonthlyRate('yearly', 12.5)).toBeLessThan(1)
  })
})
