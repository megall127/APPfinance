/**
 * ESPELHO de api/app/modules/reserves/interest.ts.
 * Qualquer mudança aqui exige a MESMA mudança lá.
 * Os vetores dourados V1..V12 (§5.9 do spec) estão duplicados nos dois testes.
 *
 * Pure module: no DOM, no JSX, no HTTP.
 *
 * Units — the #1 source of bugs in this feature (§5.0):
 * - rateValue / annualRate / cdiAnnual  → PERCENT (0.85, 12.5, 102, 14.9)
 * - i / effective monthly rate          → FRACTION 0..1 (0.0118757178)
 * - money inside the engine             → INTEGER CENTS (1269355)
 * - money on the wire / database        → reais with 2 decimals ("12693.55")
 */

/** Business days used by the CDI convention (B3/CETIP). */
const BUSINESS_DAYS_YEAR = 252
/** 252/12 EXACT — this is what makes 100% of CDI recompose to the annual CDI. */
const BUSINESS_DAYS_MONTH = 21
/** Canonical month length used by the projection/goal simulator. */
const PROJ_DAYS = 30

/** Reais (string or number) → integer cents. */
export function toCents(v: string | number): number {
  return Math.round(Number(v) * 100)
}

/** Integer cents → reais with 2 decimals, as stored/sent ("112.64"). */
export function fromCents(c: number): string {
  return (c / 100).toFixed(2)
}

/**
 * Symmetric half-up rounding (away from zero). Input and output in CENTS.
 * roundCents(1.5) = 2, roundCents(-1.5) = -2, roundCents(9425.8625) = 9426.
 */
export function roundCents(v: number): number {
  return v < 0 ? -Math.round(-v) : Math.round(v)
}

/**
 * Pro-rata weight of money that lands on `day` of a month with `daysInMonth`
 * days: it stays in the account on days `day..daysInMonth`, i.e.
 * `(daysInMonth - day + 1)` days out of `daysInMonth`.
 *
 * `day` is truncated and clamped to [1, daysInMonth], so day 1 weighs 1 —
 * the same as the opening balance carried from the previous month.
 */
export function weightForDay(day: number, daysInMonth: number): number {
  const d = Math.min(Math.max(Math.trunc(day), 1), daysInMonth)
  return (daysInMonth - d + 1) / daysInMonth
}

/**
 * Effective MONTHLY rate as a fraction 0..1.
 *
 * @param kind      'monthly' | 'yearly' | 'cdi'
 * @param value     PERCENT of the rate period (0.85 | 12.5 | 102)
 * @param cdiAnnual PERCENT of the month's ANNUAL CDI (14.9) — required only when kind='cdi'
 * @returns fraction 0..1, or null when kind='cdi' and there is no resolvable CDI
 *
 * 'yearly' uses the EQUIVALENT rate, never v/12: 10% a.a. → 0.007974140429 a.m.
 * 'cdi' applies the percentage to the DAILY rate (B3/CETIP convention), so
 * 100% of CDI recomposes to exactly the annual CDI.
 */
export function effectiveMonthlyRate(
  kind: 'monthly' | 'yearly' | 'cdi',
  value: number,
  cdiAnnual?: number | null,
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

/** Annual equivalent (fraction) of a monthly rate `i` (fraction). */
export function annualEquivalent(i: number): number {
  return Math.pow(1 + i, 12) - 1
}

/** A movement of the month, as the base calculation sees it. */
export interface MovementInput {
  /** Day of the month the movement occurred on (1..daysInMonth). */
  day: number
  /** Signed amount in CENTS: deposits positive, withdrawals negative. */
  amountCents: number
}

/**
 * Weighted base B of a full month, in CENTS (fractional — never rounded).
 *
 *   B = S0 + Σ m_k × weightForDay(d_k, D)
 *
 * `openingCents` (S0) is the sum of every movement before day 1 of the
 * month — including previous months' yields, which is what makes compounding
 * emergent. Yields of the month itself must NOT be in `movements`.
 *
 * A negative base is clamped to 0: a negative balance yields nothing and never
 * charges "debt interest".
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
 * Weighted base of the CURRENT month up to day `today` (1..D), in CENTS.
 * Used for the partial yield shown in the UI — calculated, never persisted.
 *
 *   B_parcial = S0 × (t/D) + Σ m_k × ((t − d_k + 1)/D)   (only d_k <= t)
 *
 * Written this way — and NOT by dividing the accumulated sum at the end —
 * because at `today === daysInMonth` it reduces BIT FOR BIT to
 * `weightedBaseCents`: `S0 × 1 === S0`, and the movement weight becomes exactly
 * the `(D − d + 1)/D` of `weightForDay`. Dividing at the end drifts ~1e-10 from
 * the full month and would break that identity.
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

/** One month of the projection curve. All amounts in CENTS. */
export interface ProjectionPoint {
  mes: number
  aportadoCents: number
  rendimentoCents: number
  saldoCents: number
}

/**
 * Projects `meses` months of a monthly contribution using the SAME weighted
 * base and the SAME per-month rounding as the yield engine.
 *
 * `diaDoAporte` is part of the contract on purpose: silently assuming day 1
 * overstates a 120-month projection by hundreds of reais.
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
    out.push({
      mes: m,
      aportadoCents: aportado,
      rendimentoCents: rendimento,
      saldoCents: saldo,
    })
  }
  return out
}

/**
 * Months needed to reach `metaCents`, ITERATING the same recurrence as
 * `projectMonths` (a closed form for the ordinary annuity is off by a whole
 * month in trivial cases).
 *
 * Returns 0 when the goal is already reached, and null when it is
 * unreachable — no contribution and no rate, or more than 600 months.
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
    saldo +=
      input.aporteCents + roundCents((saldo + input.aporteCents * w) * input.i)
    if (saldo >= input.metaCents) return m
  }
  return null
}
