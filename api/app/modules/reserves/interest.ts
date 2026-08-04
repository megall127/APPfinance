/**
 * ESPELHO de web/src/features/reservas/interest.ts. Qualquer mudança aqui exige a MESMA mudança lá.
 * Os vetores dourados V1..V10 (§5.9 do spec) estão duplicados nos dois testes.
 *
 * Módulo PURO: nenhum import de Lucid, HttpContext, luxon ou qualquer coisa do Adonis.
 * Toda a matemática do rendimento vive aqui e em lugar nenhum mais.
 *
 * UNIDADES (§5.0 — a fonte #1 de erro desta feature):
 *   rateValue / annualRate / cdiAnnual ....... PERCENTUAL (0.85 | 12.5 | 102 | 14.9)
 *   i / taxa efetiva / yieldRateApplied ...... FRAÇÃO 0..1 (0.0118757178)
 *   dinheiro dentro do motor ................. CENTAVOS (inteiros; bases ponderadas são
 *                                              fracionárias por construção)
 *   dinheiro no banco/JSON ................... reais com 2 casas ("12693.55")
 */

/** Dias úteis por ano (convenção B3/CETIP para CDI). */
const BUSINESS_DAYS_YEAR = 252

/** Dias úteis por mês. 252/12 EXATO — é o que faz 100% do CDI recompor o CDI anual. */
const BUSINESS_DAYS_MONTH = 21

/** Mês canônico da projeção/simulador (não existe calendário fora do banco). */
const PROJ_DAYS = 30

/**
 * Converte dinheiro de fronteira (reais, string do banco ou número) em CENTAVOS inteiros.
 *
 * @param v reais — `"12693.55"` ou `12693.55`
 * @returns CENTAVOS inteiros — `1269355`
 */
export function toCents(v: string | number): number {
  return Math.round(Number(v) * 100)
}

/**
 * Converte CENTAVOS inteiros de volta para reais com 2 casas, prontos para `decimal(12,2)`.
 *
 * @param c CENTAVOS — `11264`
 * @returns reais com 2 casas — `"112.64"`
 */
export function fromCents(c: number): string {
  return (c / 100).toFixed(2)
}

/**
 * Arredondamento half-up simétrico (away from zero). Único arredondamento de dinheiro
 * do motor (§5.4): `Math.round` já é half-up em direção a +∞, o espelho cobre negativos.
 *
 * @param v CENTAVOS fracionários — `9425.8625`
 * @returns CENTAVOS inteiros — `9426`
 */
export function roundCents(v: number): number {
  return v < 0 ? -Math.round(-v) : Math.round(v)
}

/**
 * Peso pro-rata por dias corridos: o dinheiro lançado no dia `day` esteve na conta
 * nos dias `day..daysInMonth`, ou seja `daysInMonth − day + 1` de `daysInMonth` (§5.3).
 *
 * @param day         dia do movimento (1..daysInMonth); é truncado e clampado
 * @param daysInMonth dias reais do mês (28 | 29 | 30 | 31)
 * @returns FRAÇÃO 0..1 — dia 1 ⇒ 1, último dia ⇒ 1/daysInMonth
 */
export function weightForDay(day: number, daysInMonth: number): number {
  const d = Math.min(Math.max(Math.trunc(day), 1), daysInMonth)
  return (daysInMonth - d + 1) / daysInMonth
}

/**
 * Taxa efetiva MENSAL a partir da vigência (§5.2).
 * `yearly` usa taxa EQUIVALENTE, jamais `v/12`. `cdi` incide sobre a taxa DIÁRIA de 252
 * dias úteis — a convenção real de CDB/LCI/LCA.
 *
 * @param kind      'monthly' | 'yearly' | 'cdi'
 * @param value     PERCENTUAL da vigência (0.85 | 12.5 | 102)
 * @param cdiAnnual PERCENTUAL do CDI ANUAL do mês (14.9) — obrigatório só quando kind='cdi'
 * @returns FRAÇÃO 0..1, ou `null` quando kind='cdi' e não há CDI resolvível (→ skip 'cdi_missing')
 */
export function effectiveMonthlyRate(
  kind: 'monthly' | 'yearly' | 'cdi',
  value: number,
  cdiAnnual?: number | null
): number | null {
  const v = Number.isFinite(value) && value > 0 ? value : 0
  switch (kind) {
    case 'monthly':
      return v / 100
    case 'yearly':
      return Math.pow(1 + v / 100, 1 / 12) - 1
    case 'cdi': {
      if (cdiAnnual == null || !Number.isFinite(cdiAnnual)) return null
      const tdi = Math.pow(1 + cdiAnnual / 100, 1 / BUSINESS_DAYS_YEAR) - 1
      const daily = tdi * (v / 100)
      return Math.pow(1 + daily, BUSINESS_DAYS_MONTH) - 1
    }
  }
}

/**
 * Equivalente anual de uma taxa mensal — usado nos rótulos da UI e como oráculo de teste
 * (100% do CDI recomposto devolve o CDI anual, porque 21 × 12 = 252 exato).
 *
 * @param i FRAÇÃO 0..1 mensal
 * @returns FRAÇÃO 0..1 anual
 */
export function annualEquivalent(i: number): number {
  return Math.pow(1 + i, 12) - 1
}

/** Um movimento do mês de competência, já em centavos e já ASSINADO (saque < 0). */
export interface MovementInput {
  /** dia do mês (1..daysInMonth) */
  day: number
  /** CENTAVOS inteiros e assinados */
  amountCents: number
}

/**
 * Base ponderada do mês CHEIO (§5.3): `B = S₀ + Σ m_k × peso(d_k)`, com clamp em 0.
 * Nunca arredondada — o produto `B × i` é o único ponto de arredondamento.
 *
 * @param input.openingCents CENTAVOS do saldo trazido (Σ amount com occurred_on < dia 1 do mês)
 * @param input.movements    movimentos DENTRO do mês, excluindo o `yield` do próprio mês
 * @param input.daysInMonth  dias reais do mês
 * @returns CENTAVOS FRACIONÁRIOS (≥ 0)
 */
export function weightedBaseCents(input: {
  openingCents: number
  movements: MovementInput[]
  daysInMonth: number
}): number {
  let base = input.openingCents
  for (const m of input.movements) {
    base += m.amountCents * weightForDay(m.day, input.daysInMonth)
  }
  return base < 0 ? 0 : base
}

/**
 * Base ponderada PARCIAL do mês corrente (§5.6), até o dia `today` inclusive:
 * `B_parcial = S₀ × (t/D) + Σ m_k × ((t − d_k + 1)/D)`, só com `d_k ≤ t`, clamp em 0.
 *
 * Escrita nesta forma (e não dividindo a soma no fim) porque em `today === daysInMonth`
 * ela reduz BIT A BIT ao resultado de `weightedBaseCents`: `S₀ × 1 === S₀` e o peso
 * vira exatamente `(D − d + 1)/D`.
 *
 * @param input.openingCents CENTAVOS do saldo trazido
 * @param input.movements    movimentos do mês (os com dia > `today` são ignorados)
 * @param input.daysInMonth  dias reais do mês
 * @param input.today        dia de hoje (1..daysInMonth); é truncado e clampado
 * @returns CENTAVOS FRACIONÁRIOS (≥ 0)
 */
export function partialBaseCents(input: {
  openingCents: number
  movements: MovementInput[]
  daysInMonth: number
  today: number
}): number {
  const t = Math.min(Math.max(Math.trunc(input.today), 1), input.daysInMonth)
  let base = input.openingCents * (t / input.daysInMonth)
  for (const m of input.movements) {
    const d = Math.min(Math.max(Math.trunc(m.day), 1), input.daysInMonth)
    if (d > t) continue
    base += m.amountCents * ((t - d + 1) / input.daysInMonth)
  }
  return base < 0 ? 0 : base
}

/** Um ponto da curva do simulador. Todo dinheiro em CENTAVOS inteiros. */
export interface ProjectionPoint {
  mes: number
  aportadoCents: number
  rendimentoCents: number
  saldoCents: number
}

/**
 * Projeção mês a mês do simulador (§5.8) — MESMA base ponderada e MESMO arredondamento
 * por mês do motor de apuração, num mês canônico de 30 dias.
 *
 * @param input.saldoInicialCents CENTAVOS
 * @param input.aporteCents       CENTAVOS aportados por mês
 * @param input.i                 FRAÇÃO 0..1 mensal
 * @param input.meses             número de meses projetados
 * @param input.diaDoAporte       dia do aporte (1..30); default 1
 * @returns série de `ProjectionPoint`, tudo em CENTAVOS inteiros
 */
export function projectMonths(input: {
  saldoInicialCents: number
  aporteCents: number
  i: number
  meses: number
  diaDoAporte?: number
}): ProjectionPoint[] {
  const w = weightForDay(input.diaDoAporte ?? 1, PROJ_DAYS)
  let saldo = input.saldoInicialCents
  let aportado = input.saldoInicialCents
  let rendimento = 0
  const out: ProjectionPoint[] = []
  for (let m = 1; m <= input.meses; m++) {
    const base = saldo + input.aporteCents * w
    const r = roundCents(base * input.i)
    saldo += input.aporteCents + r
    aportado += input.aporteCents
    rendimento += r
    out.push({ mes: m, aportadoCents: aportado, rendimentoCents: rendimento, saldoCents: saldo })
  }
  return out
}

/**
 * Meses até a meta (§5.8). ITERA a mesma recorrência de `projectMonths` — a fórmula
 * fechada postecipada erra 1 mês inteiro em casos triviais.
 *
 * @param input.saldoInicialCents CENTAVOS
 * @param input.aporteCents       CENTAVOS aportados por mês
 * @param input.i                 FRAÇÃO 0..1 mensal
 * @param input.metaCents         CENTAVOS da meta
 * @param input.diaDoAporte       dia do aporte (1..30); default 1
 * @returns número de meses, `0` se a meta já foi atingida, `null` se inalcançável (> 600 meses)
 */
export function monthsToGoal(input: {
  saldoInicialCents: number
  aporteCents: number
  i: number
  metaCents: number
  diaDoAporte?: number
}): number | null {
  if (input.metaCents <= input.saldoInicialCents) return 0
  if (input.aporteCents <= 0 && input.i <= 0) return null
  const w = weightForDay(input.diaDoAporte ?? 1, PROJ_DAYS)
  let saldo = input.saldoInicialCents
  for (let m = 1; m <= 600; m++) {
    saldo += input.aporteCents + roundCents((saldo + input.aporteCents * w) * input.i)
    if (saldo >= input.metaCents) return m
  }
  return null
}
