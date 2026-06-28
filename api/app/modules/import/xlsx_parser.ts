import ExcelJS from 'exceljs'

/**
 * Item kinds understood by the importer.
 * - income            → top "Planilha de custos" salary block (base value, no months)
 * - expense           → yearly "Planilha de custos/mês YYYY" blocks (base + monthly values)
 * - card_subscription → "Fixos cartão de crédito" lists (single fixed value, no months)
 */
export type Kind = 'income' | 'expense' | 'card_subscription'

export type ParsedEntry = {
  month: number
  amount: number
  status: 'paid' | 'pending'
}

export type ParsedItem = {
  name: string
  kind: Kind
  categoryHint?: string
  /** Base/budget value from the "Valores" column (income/card use this as their only value). */
  defaultAmount?: number
  entries: ParsedEntry[]
}

export type ParsedYear = {
  year: number
  items: ParsedItem[]
}

export type ParsedWorkbook = {
  years: ParsedYear[]
}

const MONTHS: Record<string, number> = {
  jan: 1,
  fev: 2,
  mar: 3,
  abr: 4,
  mai: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  set: 9,
  out: 10,
  nov: 11,
  dez: 12,
}

const CARD_TITLE = 'fixos cartao de credito'

/**
 * Normalize a label for matching: strip accents, lowercase, collapse whitespace.
 * Lets "Empréstimo" match "Emprestimo" and "Celular " match "Celular".
 */
function norm(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Synthesize 12 pending monthly entries (months 1..12) at a fixed base amount.
 * Used for recurring income / card subscriptions, which carry a single base value
 * in the sheet but should pre-fill the whole latest year so the dashboard reflects them.
 */
function monthlyEntries(amount: number): ParsedEntry[] {
  return Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    amount,
    status: 'pending' as const,
  }))
}

/** Map a Portuguese month abbreviation (Jan, Fev, ...) to 1..12, or null. */
function monthOf(text: string): number | null {
  const key = text.trim().toLowerCase().slice(0, 3)
  return MONTHS[key] ?? null
}

/**
 * Tolerant numeric coercion for messy cells.
 * Handles "R$ 125,05", "65 (guardado BB)", "233,67", "1.250,00", "x", "-", blanks.
 * Returns null when no number can be recovered.
 */
export function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const cleaned = value
    .replace(/r\$\s*/i, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^0-9.\-]/g, '')
    .trim()
  const n = Number.parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}

/**
 * Read a cell down to a primitive. ExcelJS cell values can be a number, string,
 * boolean, Date, rich-text object, formula object ({ result }), or hyperlink.
 * Formula cells resolve to their cached result; rich text is flattened to plain text.
 */
function readCell(cell: ExcelJS.Cell): number | string | null {
  const v = cell.value
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  if (v instanceof Date) return null
  if (typeof v === 'object') {
    // Narrow the ExcelJS cell-value union by discriminating property.
    if ('richText' in v) return v.richText.map((r) => r.text ?? '').join('')
    if ('result' in v) {
      const r = v.result
      if (typeof r === 'number') return Number.isFinite(r) ? r : null
      if (typeof r === 'string') return r
      return null
    }
    if ('text' in v) return typeof v.text === 'string' ? v.text : null
    return null
  }
  return null
}

function cellText(cell: ExcelJS.Cell): string {
  const v = readCell(cell)
  return v === null ? '' : String(v)
}

/** True when the cell holds a formula (normal or shared) — used to detect SUM/Total rows. */
function isFormulaCell(cell: ExcelJS.Cell): boolean {
  const v = cell.value
  return typeof v === 'object' && v !== null && ('formula' in v || 'sharedFormula' in v)
}

/**
 * Category hint by item name. Order matters: "Gasolina" must win over the
 * "gás" (Moradia) rule. Accent-insensitive (operates on normalized text).
 */
export function categoryHintFor(name: string): string {
  const n = norm(name)
  if (/gasolina/.test(n)) return 'Transporte'
  if (/internet|condom|luz|gas\b/.test(n)) return 'Moradia'
  if (/saude/.test(n)) return 'Saúde'
  if (/faculdade/.test(n)) return 'Educação'
  if (/cartao|nfs/.test(n)) return 'Cartão'
  return 'Outros'
}

/**
 * Build the 2026 status map from the "Controle 2026" sheet.
 * That sheet repeats the months twice in its header: first as value columns
 * (C..N), then as status columns (P..AA). We map a month to its SECOND
 * occurrence (the status column) and record which months are marked "Pago"
 * per item name. Everything not explicitly "Pago" stays pending.
 */
function buildPaidMap(sheet: ExcelJS.Worksheet | undefined): Map<string, Set<number>> {
  const paidByName = new Map<string, Set<number>>()
  if (!sheet) return paidByName

  let headerRow = -1
  for (let r = 1; r <= sheet.rowCount; r++) {
    if (
      norm(cellText(sheet.getRow(r).getCell(1))) === 'item' &&
      norm(cellText(sheet.getRow(r).getCell(2))) === 'valor base'
    ) {
      headerRow = r
      break
    }
  }
  if (headerRow === -1) return paidByName

  const statusCol: Record<number, number> = {}
  const seenValueCol: Record<number, number> = {}
  for (let c = 1; c <= sheet.columnCount; c++) {
    const m = monthOf(cellText(sheet.getRow(headerRow).getCell(c)))
    if (m === null) continue
    if (!(m in seenValueCol)) seenValueCol[m] = c
    else if (!(m in statusCol)) statusCol[m] = c
  }

  for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
    const name = cellText(sheet.getRow(r).getCell(1)).trim()
    if (!name) continue
    if (/^resumo/i.test(name)) break
    const paid = new Set<number>()
    for (const key of Object.keys(statusCol)) {
      const month = Number(key)
      if (/pago/i.test(cellText(sheet.getRow(r).getCell(statusCol[month])))) paid.add(month)
    }
    if (paid.size > 0) paidByName.set(norm(name), paid)
  }
  return paidByName
}

/** Parse the top salary block → income items (base value, no monthly entries). */
function parseIncome(sheet: ExcelJS.Worksheet): ParsedItem[] {
  const items: ParsedItem[] = []
  const rows = sheet.rowCount
  for (let r = 1; r <= rows; r++) {
    const isIncomeHeader =
      norm(cellText(sheet.getRow(r).getCell(1))) === 'item' &&
      norm(cellText(sheet.getRow(r).getCell(2))) === 'valores' &&
      monthOf(cellText(sheet.getRow(r).getCell(3))) === null
    if (!isIncomeHeader) continue

    for (let ir = r + 1; ir <= rows; ir++) {
      const a = sheet.getRow(ir).getCell(1)
      if (isFormulaCell(a)) break
      const name = cellText(a).trim()
      if (/^total/i.test(name) || /planilha de custos\/m/.test(norm(name))) break
      if (!name) continue
      const base = toNumber(readCell(sheet.getRow(ir).getCell(2)))
      items.push({
        name,
        kind: 'income',
        categoryHint: categoryHintFor(name),
        defaultAmount: base ?? undefined,
        entries: base !== null ? monthlyEntries(base) : [],
      })
    }
    break
  }
  return items
}

/** Parse each "Planilha de custos/mês YYYY" block → expense items with monthly entries. */
function parseExpenseYears(sheet: ExcelJS.Worksheet): Map<number, ParsedYear> {
  const yearsMap = new Map<number, ParsedYear>()
  const rows = sheet.rowCount

  for (let r = 1; r <= rows; r++) {
    const match = norm(cellText(sheet.getRow(r).getCell(1))).match(
      /planilha de custos\/mes\s*(\d{4})/
    )
    if (!match) continue
    const year = Number(match[1])
    const headerRow = r + 1

    const monthCols: Array<[number, number]> = []
    for (let c = 3; c <= sheet.columnCount; c++) {
      const m = monthOf(cellText(sheet.getRow(headerRow).getCell(c)))
      if (m !== null) monthCols.push([c, m])
    }

    const items: ParsedItem[] = []
    for (let ir = headerRow + 1; ir <= rows; ir++) {
      const a = sheet.getRow(ir).getCell(1)
      if (isFormulaCell(a)) break
      const name = cellText(a).trim()
      if (/^total/i.test(name) || /planilha de custos\/m/.test(norm(name))) break
      if (!name) continue

      const base = toNumber(readCell(sheet.getRow(ir).getCell(2)))
      const entries: ParsedEntry[] = []
      for (const [c, month] of monthCols) {
        const amount = toNumber(readCell(sheet.getRow(ir).getCell(c)))
        if (amount === null) continue
        entries.push({ month, amount, status: 'pending' })
      }
      items.push({
        name,
        kind: 'expense',
        categoryHint: categoryHintFor(name),
        defaultAmount: base ?? undefined,
        entries,
      })
    }
    yearsMap.set(year, { year, items })
  }
  return yearsMap
}

/**
 * Parse every "Fixos cartão de crédito" list → card_subscription items (deduped by name).
 * The title spans two columns; the left-neighbor guard skips the merged continuation
 * so values are not mistaken for names.
 */
function parseCardSubscriptions(sheet: ExcelJS.Worksheet): ParsedItem[] {
  const items: ParsedItem[] = []
  const seen = new Set<string>()
  const rows = sheet.rowCount

  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= sheet.columnCount; c++) {
      const here = norm(cellText(sheet.getRow(r).getCell(c)))
      if (here !== CARD_TITLE) continue
      // Skip the merged continuation of the (two-column) title so values aren't read as names.
      if (c > 1 && norm(cellText(sheet.getRow(r).getCell(c - 1))) === CARD_TITLE) continue

      for (let ir = r + 1; ir <= rows; ir++) {
        const name = cellText(sheet.getRow(ir).getCell(c)).trim()
        if (!name) break
        const key = norm(name)
        if (seen.has(key)) continue
        seen.add(key)
        const value = toNumber(readCell(sheet.getRow(ir).getCell(c + 1)))
        items.push({
          name,
          kind: 'card_subscription',
          categoryHint: categoryHintFor(name),
          defaultAmount: value ?? undefined,
          entries: value !== null ? monthlyEntries(value) : [],
        })
      }
    }
  }
  return items
}

/**
 * Parse the cost spreadsheet into a normalized, tolerant structure.
 *
 * Accepts a Buffer (uploaded file bytes) or a filesystem path.
 * Income + card-subscription items (which have no year of their own) are attached
 * to the most recent expense year so they are still committed. Status for year 2026
 * is taken from the "Controle 2026" sheet; all other years/months default to pending.
 */
export async function parseWorkbook(source: Buffer | string): Promise<ParsedWorkbook> {
  const wb = new ExcelJS.Workbook()
  if (typeof source === 'string') {
    await wb.xlsx.readFile(source)
  } else {
    // ExcelJS's load() param predates @types/node's generic Buffer<TArrayBuffer>;
    // a localized cast bridges the two (runtime accepts a Node Buffer either way).
    await wb.xlsx.load(source as unknown as Parameters<typeof wb.xlsx.load>[0])
  }

  const mainSheet = wb.getWorksheet('Página1') ?? wb.worksheets[0]
  if (!mainSheet) return { years: [] }

  const yearsMap = parseExpenseYears(mainSheet)
  const income = parseIncome(mainSheet)
  const cards = parseCardSubscriptions(mainSheet)
  const paidByName = buildPaidMap(wb.getWorksheet('Controle 2026'))

  // Attach income + card items (no year of their own) to the latest year.
  if (yearsMap.size > 0) {
    const latest = Math.max(...yearsMap.keys())
    yearsMap.get(latest)!.items.push(...income, ...cards)
  }

  // Apply 2026 paid/pending status by matching item name. Only real expenses
  // carry a Pago/Pendente status; synthesized income/subscription entries stay
  // pending (and would otherwise be cross-matched by name, e.g. card "Celular").
  const y2026 = yearsMap.get(2026)
  if (y2026) {
    for (const item of y2026.items) {
      if (item.kind !== 'expense') continue
      const paidMonths = paidByName.get(norm(item.name))
      for (const entry of item.entries) {
        entry.status = paidMonths?.has(entry.month) ? 'paid' : 'pending'
      }
    }
  }

  const years = [...yearsMap.values()].sort((a, b) => b.year - a.year)
  return { years }
}
