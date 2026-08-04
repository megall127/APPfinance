import { test } from '@japa/runner'
import {
  annualEquivalent,
  effectiveMonthlyRate,
  fromCents,
  monthsToGoal,
  partialBaseCents,
  projectMonths,
  roundCents,
  toCents,
  weightForDay,
  weightedBaseCents,
} from '#modules/reserves/interest'

/**
 * Vetores dourados V1..V12 do §5.9 do spec. Este arquivo é o ESPELHO de
 * web/src/features/reservas/interest.test.ts — os mesmos vetores, os mesmos números.
 *
 * Convenções de asserção:
 * - CENTAVOS (inteiros) → assert.equal
 * - taxas e bases ponderadas (float) → assert.closeTo com delta EXPLÍCITO
 * - bases são comparadas em REAIS com delta 1e-6, a mesma precisão da coluna
 *   `yield_base decimal(14,6)` que o extrato imprime
 */

test.group('Reservas – taxa efetiva mensal', () => {
  test('V1: 10% a.a. vira a taxa mensal EQUIVALENTE 0,7974140429%', ({ assert }) => {
    const i = effectiveMonthlyRate('yearly', 10)!
    assert.closeTo(i, 0.007974140429, 1e-12)
    assert.closeTo(annualEquivalent(i), 0.1, 1e-12)
  })

  test('V1b: o proporcional 10/12 é rejeitado — capitaliza para 10,4713% a.a.', ({ assert }) => {
    assert.closeTo(annualEquivalent(10 / 12 / 100), 0.104713, 1e-6)
    assert.isAbove(Math.abs(annualEquivalent(10 / 12 / 100) - 0.1), 0.004)
  })

  test('V2: 100% do CDI de 14,90% a.a. dá 1,1641575% a.m.', ({ assert }) => {
    const i = effectiveMonthlyRate('cdi', 100, 14.9)!
    assert.closeTo(i, 0.011641575, 1e-10)
  })

  test('V2 (propriedade 21×12=252): 100% do CDI recompõe o CDI anual', ({ assert }) => {
    const i = effectiveMonthlyRate('cdi', 100, 14.9)!
    assert.closeTo(annualEquivalent(i), 0.149, 1e-12)
  })

  test('V2b: 102% e 110% do CDI', ({ assert }) => {
    assert.closeTo(effectiveMonthlyRate('cdi', 102, 14.9)!, 0.0118757178, 1e-10)
    assert.closeTo(effectiveMonthlyRate('cdi', 110, 14.9)!, 0.0128128053, 1e-10)
    assert.closeTo(annualEquivalent(effectiveMonthlyRate('cdi', 102, 14.9)!), 0.15219528, 1e-8)
  })

  test('V2c: sem CDI resolvível a taxa é null (nunca zero silencioso)', ({ assert }) => {
    assert.isNull(effectiveMonthlyRate('cdi', 100, null))
    assert.isNull(effectiveMonthlyRate('cdi', 100, undefined))
    assert.isNull(effectiveMonthlyRate('cdi', 100, Number.NaN))
  })

  test('taxa não positiva é tratada como zero, sem NaN', ({ assert }) => {
    assert.equal(effectiveMonthlyRate('monthly', -1), 0)
    assert.equal(effectiveMonthlyRate('yearly', Number.NaN), 0)
  })
})

test.group('Reservas – pesos e base ponderada', () => {
  test('V4: D=31, S₀ 1.000, depósito 3.000 no dia 16, i 0,01', ({ assert }) => {
    assert.closeTo(weightForDay(16, 31), 0.51612903, 1e-8)
    const base = weightedBaseCents({
      openingCents: toCents(1000),
      movements: [{ day: 16, amountCents: toCents(3000) }],
      daysInMonth: 31,
    })
    assert.closeTo(base / 100, 2548.387097, 1e-6)
    assert.equal(roundCents(base * 0.01), 2548)
  })

  test('V5: D=30, S₀ 5.000, saque 2.000 no dia 10, i 0,01', ({ assert }) => {
    assert.closeTo(weightForDay(10, 30), 0.7, 1e-12)
    const base = weightedBaseCents({
      openingCents: toCents(5000),
      movements: [{ day: 10, amountCents: toCents(-2000) }],
      daysInMonth: 30,
    })
    assert.closeTo(base / 100, 3600, 1e-6)
    assert.equal(roundCents(base * 0.01), 3600)
  })

  test('V6.1: saldo trazido ≡ depósito no dia 1 (peso 1)', ({ assert }) => {
    const comSaldo = weightedBaseCents({
      openingCents: toCents(10000),
      movements: [],
      daysInMonth: 31,
    })
    const comDeposito = weightedBaseCents({
      openingCents: 0,
      movements: [{ day: 1, amountCents: toCents(10000) }],
      daysInMonth: 31,
    })
    assert.equal(comSaldo, 1000000)
    assert.equal(comDeposito, comSaldo)
  })

  test('V6.2: depósito e saque no mesmo dia se cancelam sem resíduo', ({ assert }) => {
    const base = weightedBaseCents({
      openingCents: toCents(10000),
      movements: [
        { day: 13, amountCents: toCents(700) },
        { day: 13, amountCents: toCents(-700) },
      ],
      daysInMonth: 31,
    })
    assert.equal(base, 1000000)
  })

  test('V6.3: saque no dia d mantém (d − 1)/D da base', ({ assert }) => {
    const base = weightedBaseCents({
      openingCents: toCents(3100),
      movements: [{ day: 11, amountCents: toCents(-3100) }],
      daysInMonth: 31,
    })
    assert.closeTo(base, 310000 * (10 / 31), 1e-6)
  })

  test('base negativa é clampada em 0 — dívida não rende nem cobra juros', ({ assert }) => {
    const base = weightedBaseCents({
      openingCents: toCents(100),
      movements: [{ day: 1, amountCents: toCents(-500) }],
      daysInMonth: 30,
    })
    assert.equal(base, 0)
  })

  test('weightForDay clampa dia fora da faixa e trunca fração', ({ assert }) => {
    assert.closeTo(weightForDay(0, 31), 1, 1e-12)
    assert.closeTo(weightForDay(99, 31), 1 / 31, 1e-12)
    assert.closeTo(weightForDay(16.9, 31), weightForDay(16, 31), 1e-12)
  })
})

test.group('Reservas – arredondamento', () => {
  test('V12: half-up simétrico (away from zero)', ({ assert }) => {
    assert.equal(roundCents(9425.8625), 9426)
    assert.equal(roundCents(0.5), 1)
    assert.equal(roundCents(-0.5), -1)
    assert.equal(roundCents(1.5), 2)
    assert.equal(roundCents(-1.5), -2)
    assert.equal(roundCents(0.4), 0)
  })

  test('V8: base de R$ 0,40 a 1,1641575% a.m. rende 0 → skip zero_yield', ({ assert }) => {
    const base = weightedBaseCents({ openingCents: 40, movements: [], daysInMonth: 31 })
    assert.closeTo(base * 0.011641575, 0.4657, 1e-4)
    assert.equal(roundCents(base * 0.011641575), 0)
  })
})

test.group('Reservas – capitalização composta', () => {
  test('V3: cadeia de 3 meses, S₀ 10.000, aporte 500 no dia 1, i 0,0085, D 31', ({ assert }) => {
    const i = 0.0085
    const aporte = toCents(500)
    let saldo = toCents(10000)
    const rendimentos: number[] = []

    for (let m = 0; m < 3; m++) {
      const base = weightedBaseCents({
        openingCents: saldo,
        movements: [{ day: 1, amountCents: aporte }],
        daysInMonth: 31,
      })
      const rendimento = roundCents(base * i)
      rendimentos.push(rendimento)
      saldo += aporte + rendimento
    }

    assert.deepEqual(rendimentos, [8925, 9426, 9931])
    assert.equal(saldo, 1178282)
    assert.equal(fromCents(saldo), '11782.82')
  })

  test('V3 (M2): 1.108.925 × 0,0085 = 9425,8625 centavos → 9426', ({ assert }) => {
    assert.closeTo(1108925 * 0.0085, 9425.8625, 1e-6)
    assert.equal(roundCents(1108925 * 0.0085), 9426)
  })
})

test.group('Reservas – rendimento parcial', () => {
  const abertura = toCents(11364.28)
  const movimentos = [{ day: 5, amountCents: toCents(1500) }]
  const i = 0.0118757178

  test('V10: julho/2026 (D=31), hoje dia 21 — parcial R$ 101,19', ({ assert }) => {
    const base = partialBaseCents({
      openingCents: abertura,
      movements: movimentos,
      daysInMonth: 31,
      today: 21,
    })
    assert.closeTo(base / 100, 8520.963871, 1e-6)
    assert.equal(roundCents(base * i), 10119)
    assert.equal(fromCents(roundCents(base * i)), '101.19')
  })

  test('V10: previsto para o fechamento do mês — R$ 150,47', ({ assert }) => {
    const base = weightedBaseCents({
      openingCents: abertura,
      movements: movimentos,
      daysInMonth: 31,
    })
    assert.closeTo(base / 100, 12670.731613, 1e-6)
    assert.equal(roundCents(base * i), 15047)
  })

  test('identidade: em t = D a base parcial é BIT A BIT a base do mês cheio', ({ assert }) => {
    const parcial = partialBaseCents({
      openingCents: abertura,
      movements: movimentos,
      daysInMonth: 31,
      today: 31,
    })
    const cheia = weightedBaseCents({
      openingCents: abertura,
      movements: movimentos,
      daysInMonth: 31,
    })
    assert.isTrue(Object.is(parcial, cheia))
  })

  test('em t = 1 é exatamente um dia de juros sobre S₀', ({ assert }) => {
    const base = partialBaseCents({
      openingCents: toCents(10000),
      movements: movimentos,
      daysInMonth: 31,
      today: 1,
    })
    assert.closeTo(base, 1000000 / 31, 1e-6)
  })

  test('movimento futuro (d > t) não entra na base parcial', ({ assert }) => {
    const semFuturo = partialBaseCents({
      openingCents: abertura,
      movements: [],
      daysInMonth: 31,
      today: 3,
    })
    const comFuturo = partialBaseCents({
      openingCents: abertura,
      movements: movimentos,
      daysInMonth: 31,
      today: 3,
    })
    assert.equal(comFuturo, semFuturo)
  })

  test('base parcial negativa também é clampada em 0', ({ assert }) => {
    const base = partialBaseCents({
      openingCents: toCents(100),
      movements: [{ day: 1, amountCents: toCents(-500) }],
      daysInMonth: 30,
      today: 15,
    })
    assert.equal(base, 0)
  })
})

test.group('Reservas – projeção e meta', () => {
  /**
   * Oráculo fechado CORRETO para esta recorrência (§5.8) — usado SÓ no teste:
   *   A' = A × (1 + w·i);  S_n = B·(1+i)^n + A'·[((1+i)^n − 1)/i]
   */
  function saldoFechado(input: {
    saldoInicialCents: number
    aporteCents: number
    i: number
    meses: number
    diaDoAporte?: number
  }): number {
    const w = weightForDay(input.diaDoAporte ?? 1, 30)
    const aporteEquivalente = input.aporteCents * (1 + w * input.i)
    const fator = Math.pow(1 + input.i, input.meses)
    return input.saldoInicialCents * fator + (aporteEquivalente * (fator - 1)) / input.i
  }

  function mesesFechado(input: {
    saldoInicialCents: number
    aporteCents: number
    i: number
    metaCents: number
    diaDoAporte?: number
  }): number {
    const w = weightForDay(input.diaDoAporte ?? 1, 30)
    const aporteEquivalente = input.aporteCents * (1 + w * input.i)
    const numerador = input.metaCents * input.i + aporteEquivalente
    const denominador = input.saldoInicialCents * input.i + aporteEquivalente
    return Math.ceil(Math.log(numerador / denominador) / Math.log(1 + input.i))
  }

  test('V7: 120 meses, aporte 1.000, i 0,008, dia 1 → R$ 201.819,30', ({ assert }) => {
    const serie = projectMonths({
      saldoInicialCents: 0,
      aporteCents: toCents(1000),
      i: 0.008,
      meses: 120,
      diaDoAporte: 1,
    })
    const ultimo = serie[serie.length - 1]
    assert.lengthOf(serie, 120)
    assert.equal(ultimo.mes, 120)
    assert.equal(ultimo.saldoCents, 20181930)
    assert.equal(fromCents(ultimo.saldoCents), '201819.30')
    assert.equal(ultimo.aportadoCents, 12000000)
    assert.equal(ultimo.aportadoCents + ultimo.rendimentoCents, ultimo.saldoCents)
  })

  test('V7: drift contra a forma fechada fica abaixo de R$ 0,50', ({ assert }) => {
    const entrada = {
      saldoInicialCents: 0,
      aporteCents: toCents(1000),
      i: 0.008,
      meses: 120,
      diaDoAporte: 1,
    }
    const iterativo = projectMonths(entrada)[119].saldoCents
    const fechado = saldoFechado(entrada)
    assert.closeTo(fechado / 100, 201819.21, 0.01)
    assert.isBelow(Math.abs(iterativo - fechado), 50)
  })

  test('V7b: o MESMO caso no dia 10 (peso 0,7) → R$ 201.338,72', ({ assert }) => {
    const dia1 = projectMonths({
      saldoInicialCents: 0,
      aporteCents: toCents(1000),
      i: 0.008,
      meses: 120,
      diaDoAporte: 1,
    })[119].saldoCents
    const dia10 = projectMonths({
      saldoInicialCents: 0,
      aporteCents: toCents(1000),
      i: 0.008,
      meses: 120,
      diaDoAporte: 10,
    })[119].saldoCents

    assert.equal(dia10, 20133872)
    assert.equal(fromCents(dia10), '201338.72')
    assert.equal(dia1 - dia10, 48058)
  })

  test('V9: monthsToGoal iterativo bate com o oráculo fechado nos 5 casos', ({ assert }) => {
    const casos: Array<{
      saldoInicialCents: number
      aporteCents: number
      i: number
      metaCents: number
      diaDoAporte?: number
      esperado: number
    }> = [
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

    for (const { esperado, ...entrada } of casos) {
      assert.equal(monthsToGoal(entrada), esperado)
      assert.equal(mesesFechado(entrada), esperado)
    }
  })

  test('meta já atingida devolve 0', ({ assert }) => {
    assert.equal(
      monthsToGoal({ saldoInicialCents: 500000, aporteCents: 0, i: 0, metaCents: 500000 }),
      0
    )
    assert.equal(
      monthsToGoal({ saldoInicialCents: 500000, aporteCents: 10000, i: 0.01, metaCents: 400000 }),
      0
    )
  })

  test('sem aporte e sem taxa a meta é inalcançável (null)', ({ assert }) => {
    assert.isNull(monthsToGoal({ saldoInicialCents: 0, aporteCents: 0, i: 0, metaCents: 100000 }))
  })

  test('acima de 600 meses devolve null', ({ assert }) => {
    assert.isNull(
      monthsToGoal({
        saldoInicialCents: 0,
        aporteCents: 10000,
        i: 0.0001,
        metaCents: 10000000000,
      })
    )
  })

  test('projeção sem aporte é só capitalização do saldo inicial', ({ assert }) => {
    const serie = projectMonths({
      saldoInicialCents: 1000000,
      aporteCents: 0,
      i: 0.0085,
      meses: 1,
    })
    assert.equal(serie[0].saldoCents, 1008500)
    assert.equal(serie[0].rendimentoCents, 8500)
    assert.equal(serie[0].aportadoCents, 1000000)
  })
})

test.group('Reservas – unidades', () => {
  test('V11: 0,85% a.m. sobre R$ 10.000 rende R$ 85,00 (nem 8.500,00 nem 0,85)', ({ assert }) => {
    const i = effectiveMonthlyRate('monthly', 0.85)!
    assert.closeTo(i, 0.0085, 1e-12)
    const base = weightedBaseCents({
      openingCents: toCents(10000),
      movements: [],
      daysInMonth: 30,
    })
    const rendimento = roundCents(base * i)
    assert.equal(rendimento, 8500)
    assert.equal(fromCents(rendimento), '85.00')
  })

  test('toCents/fromCents são inversos na fronteira do banco', ({ assert }) => {
    assert.equal(toCents('12693.55'), 1269355)
    assert.equal(toCents(12693.55), 1269355)
    assert.equal(toCents('-200.00'), -20000)
    assert.equal(fromCents(1269355), '12693.55')
    assert.equal(fromCents(-20000), '-200.00')
    assert.equal(fromCents(toCents('0.10')), '0.10')
  })

  test('taxa gravada é FRAÇÃO com 10 casas e a vigência é PERCENTUAL', ({ assert }) => {
    const i = effectiveMonthlyRate('cdi', 102, 14.9)!
    assert.equal(i.toFixed(10), '0.0118757178')
    assert.equal((102).toFixed(6), '102.000000')
    assert.equal((14.9).toFixed(6), '14.900000')
  })
})
