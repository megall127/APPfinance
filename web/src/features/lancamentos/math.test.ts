import { describe, it, expect } from 'vitest'
import { parseAmountInput, computeMonthSummary } from './math'
import type { EntryRow, Entry, EntryItem, ItemKind } from './useEntries'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeItem(id: string, kind: ItemKind): EntryItem {
  return { id, name: `item-${id}`, kind, categoryId: 'c1' }
}

function makeEntry(
  itemId: string,
  amount: string,
  status: 'paid' | 'pending',
): Entry {
  return {
    id: `e-${itemId}`,
    itemId,
    year: 2026,
    month: 6,
    amount,
    status,
    paidAt: status === 'paid' ? '2026-06-10T00:00:00Z' : null,
    note: null,
  }
}

function row(item: EntryItem, entry: Entry | null): EntryRow {
  return { item, entry }
}

// ── parseAmountInput ─────────────────────────────────────────────────────────

describe('parseAmountInput', () => {
  it('parses Brazilian decimal "264,60" → 264.6', () => {
    expect(parseAmountInput('264,60')).toBe(264.6)
  })

  it('parses Brazilian thousands "1.234,56" → 1234.56 (keeps cents)', () => {
    expect(parseAmountInput('1.234,56')).toBe(1234.56)
  })

  it('parses larger thousands "1.234.567,89" → 1234567.89', () => {
    expect(parseAmountInput('1.234.567,89')).toBe(1234567.89)
  })

  it('parses plain dot-decimal "1234.56" → 1234.56', () => {
    expect(parseAmountInput('1234.56')).toBe(1234.56)
  })

  it('parses integer "1000" → 1000', () => {
    expect(parseAmountInput('1000')).toBe(1000)
  })

  it('trims surrounding whitespace', () => {
    expect(parseAmountInput('  42,00  ')).toBe(42)
  })

  it('returns null for non-numeric "abc"', () => {
    expect(parseAmountInput('abc')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseAmountInput('')).toBeNull()
  })

  it('returns null for whitespace-only string', () => {
    expect(parseAmountInput('   ')).toBeNull()
  })

  it('returns null for negative values', () => {
    expect(parseAmountInput('-5')).toBeNull()
    expect(parseAmountInput('-1.234,56')).toBeNull()
  })
})

// ── computeMonthSummary ──────────────────────────────────────────────────────

describe('computeMonthSummary', () => {
  it('counts only expense non-null entries; excludes income/card and nulls', () => {
    const rows: EntryRow[] = [
      // expense, paid → counts toward total + pago
      row(makeItem('1', 'expense'), makeEntry('1', '100.00', 'paid')),
      // expense, pending → counts toward total only
      row(makeItem('2', 'expense'), makeEntry('2', '50.00', 'pending')),
      // expense, no entry → excluded entirely
      row(makeItem('3', 'expense'), null),
      // income, paid → excluded (not an expense)
      row(makeItem('4', 'income'), makeEntry('4', '999.00', 'paid')),
      // card, pending → excluded (not an expense)
      row(makeItem('5', 'card'), makeEntry('5', '300.00', 'pending')),
    ]

    const result = computeMonthSummary(rows)
    expect(result.total).toBe(150) // 100 + 50 (only expenses with entries)
    expect(result.pago).toBe(100) // only the paid expense
    expect(result.falta).toBe(50) // 150 - 100
  })

  it('returns zeros for an empty list', () => {
    expect(computeMonthSummary([])).toEqual({ total: 0, pago: 0, falta: 0 })
  })

  it('falta equals total when nothing is paid', () => {
    const rows: EntryRow[] = [
      row(makeItem('1', 'expense'), makeEntry('1', '264.60', 'pending')),
      row(makeItem('2', 'expense'), makeEntry('2', '35.40', 'pending')),
    ]
    const result = computeMonthSummary(rows)
    expect(result.total).toBeCloseTo(300, 5)
    expect(result.pago).toBe(0)
    expect(result.falta).toBeCloseTo(300, 5)
  })

  it('falta is 0 when everything is paid', () => {
    const rows: EntryRow[] = [
      row(makeItem('1', 'expense'), makeEntry('1', '100.00', 'paid')),
      row(makeItem('2', 'expense'), makeEntry('2', '200.00', 'paid')),
    ]
    const result = computeMonthSummary(rows)
    expect(result.total).toBe(300)
    expect(result.pago).toBe(300)
    expect(result.falta).toBe(0)
  })

  it('parses string amounts and ignores non-finite amounts', () => {
    const rows: EntryRow[] = [
      row(makeItem('1', 'expense'), makeEntry('1', '264.60', 'paid')),
      // malformed amount string → skipped, not NaN-poisoned
      row(makeItem('2', 'expense'), makeEntry('2', 'not-a-number', 'pending')),
    ]
    const result = computeMonthSummary(rows)
    expect(result.total).toBe(264.6)
    expect(result.pago).toBe(264.6)
    expect(result.falta).toBe(0)
  })
})
