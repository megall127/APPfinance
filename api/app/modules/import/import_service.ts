import Item from '#models/item'
import Category from '#models/category'
import MonthlyEntry from '#models/monthly_entry'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { DEFAULT_CATEGORIES } from '#modules/workspaces/default_categories'
import { parseWorkbook } from '#modules/import/xlsx_parser'
import type { ParsedItem } from '#modules/import/xlsx_parser'

/** Color/icon lookup for category hints that match the workspace defaults. */
const DEFAULT_BY_NAME = new Map(DEFAULT_CATEGORIES.map((c) => [c.name, c]))

export type PreviewResult = {
  years: Array<{ year: number; itemCount: number; entryCount: number }>
}

export type CommitResult = {
  itemCount: number
  entryCount: number
  years: Array<{ year: number; itemCount: number; entryCount: number }>
}

export default class ImportService {
  /**
   * Parse the spreadsheet and return a per-year summary without writing anything.
   */
  async preview(_workspaceId: number, source: Buffer | string): Promise<PreviewResult> {
    const parsed = await parseWorkbook(source)
    return {
      years: parsed.years.map((y) => ({
        year: y.year,
        itemCount: y.items.length,
        entryCount: y.items.reduce((sum, item) => sum + item.entries.length, 0),
      })),
    }
  }

  /**
   * Parse + persist idempotently inside a single transaction.
   *
   * - Items are upserted by (workspaceId, name, kind) → the same logical item
   *   appearing across multiple years collapses to one row.
   * - Entries are upserted by (itemId, year, month).
   * - categoryHint is resolved to a workspace Category (created on demand).
   *
   * Re-running with the same file produces the same DB state (no duplicates).
   */
  async commit(workspaceId: number, source: Buffer | string): Promise<CommitResult> {
    const parsed = await parseWorkbook(source)

    return db.transaction(async (trx) => {
      const categoryCache = new Map<string, number>()
      const itemCache = new Map<string, Item>()
      const yearSummaries: CommitResult['years'] = []
      let entryCount = 0

      for (const year of parsed.years) {
        let yearEntries = 0
        for (const parsedItem of year.items) {
          const item = await this.#ensureItem(
            workspaceId,
            parsedItem,
            itemCache,
            categoryCache,
            trx
          )

          for (const entry of parsedItem.entries) {
            await MonthlyEntry.updateOrCreate(
              { itemId: Number(item.id), year: year.year, month: entry.month },
              {
                workspaceId,
                amount: entry.amount.toFixed(2),
                status: entry.status,
                paidAt: entry.status === 'paid' ? DateTime.now() : null,
              },
              { client: trx }
            )
            entryCount++
            yearEntries++
          }
        }
        yearSummaries.push({
          year: year.year,
          itemCount: year.items.length,
          entryCount: yearEntries,
        })
      }

      return { itemCount: itemCache.size, entryCount, years: yearSummaries }
    })
  }

  /**
   * Upsert an item by (workspaceId, name, kind), resolving its category hint.
   * Cached per commit so the same (name, kind) is touched once.
   */
  async #ensureItem(
    workspaceId: number,
    parsedItem: ParsedItem,
    itemCache: Map<string, Item>,
    categoryCache: Map<string, number>,
    trx: TransactionClientContract
  ): Promise<Item> {
    const key = `${parsedItem.kind}::${parsedItem.name}`
    const cached = itemCache.get(key)
    if (cached) return cached

    let categoryId: number | null = null
    if (parsedItem.categoryHint) {
      categoryId = await this.#ensureCategory(
        workspaceId,
        parsedItem.categoryHint,
        categoryCache,
        trx
      )
    }

    const item = await Item.updateOrCreate(
      { workspaceId, name: parsedItem.name, kind: parsedItem.kind },
      {
        categoryId,
        defaultAmount:
          parsedItem.defaultAmount !== undefined ? parsedItem.defaultAmount.toFixed(2) : null,
      },
      { client: trx }
    )
    itemCache.set(key, item)
    return item
  }

  /**
   * Find-or-create a workspace category by name (color/icon from defaults).
   */
  async #ensureCategory(
    workspaceId: number,
    name: string,
    cache: Map<string, number>,
    trx: TransactionClientContract
  ): Promise<number> {
    const cached = cache.get(name)
    if (cached !== undefined) return cached

    const def = DEFAULT_BY_NAME.get(name)
    const category = await Category.firstOrCreate(
      { workspaceId, name },
      {
        workspaceId,
        name,
        color: def?.color ?? '#6B7280',
        icon: def?.icon ?? null,
        archived: false,
        sortOrder: 0,
      },
      { client: trx }
    )
    const id = Number(category.id)
    cache.set(name, id)
    return id
  }
}
