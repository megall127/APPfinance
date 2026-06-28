import MonthlyEntry from '#models/monthly_entry'
import Item from '#models/item'
import { DateTime } from 'luxon'

type UpsertDto = {
  itemId: number
  year: number
  month: number
  amount: number
  status?: 'paid' | 'pending'
  note?: string
}

type UpdateDto = {
  amount?: number
  status?: 'paid' | 'pending'
  note?: string
}

export default class EntryService {
  /**
   * Create or update a monthly entry for the given workspace.
   * Validates that the item belongs to this workspace first (404 if not).
   * Uses unique (item_id, year, month) to find or create the row.
   */
  async upsert(workspaceId: number, dto: UpsertDto) {
    const item = await Item.query()
      .where('workspace_id', workspaceId)
      .where('id', dto.itemId)
      .firstOrFail()

    const entry = await MonthlyEntry.updateOrCreate(
      { itemId: item.id, year: dto.year, month: dto.month },
      {
        workspaceId,
        amount: dto.amount.toFixed(2),
        status: dto.status ?? 'pending',
        note: dto.note ?? null,
        paidAt: dto.status === 'paid' ? DateTime.now() : null,
      }
    )
    return entry
  }

  /**
   * Toggle status between 'paid' and 'pending'.
   * Sets paidAt = DateTime.now() when transitioning to paid, null when transitioning to pending.
   * Workspace-scoped: 404 if entry does not belong to this workspace.
   */
  async togglePaid(workspaceId: number, id: number) {
    const entry = await MonthlyEntry.query()
      .where('workspace_id', workspaceId)
      .where('id', id)
      .firstOrFail()

    // Flip the status first, then derive paidAt from the NEW status
    entry.status = entry.status === 'paid' ? 'pending' : 'paid'
    entry.paidAt = entry.status === 'paid' ? DateTime.now() : null

    await entry.save()
    return entry
  }

  /**
   * Return all ACTIVE items for the workspace, each paired with their entry
   * for the requested (year, month) or null if no entry exists.
   * Result is ordered by item sort_order ascending.
   */
  async monthView(workspaceId: number, year: number, month: number) {
    const items = await Item.query()
      .where('workspace_id', workspaceId)
      .where('is_active', true)
      .orderBy('sort_order')

    const entries = await MonthlyEntry.query()
      .where('workspace_id', workspaceId)
      .where('year', year)
      .where('month', month)

    const byItem = new Map(entries.map((e) => [e.itemId, e]))

    return items.map((item) => ({ item, entry: byItem.get(item.id) ?? null }))
  }

  /**
   * Update amount, status, and/or note on an existing entry.
   * When status changes, paidAt is kept consistent (now() on paid, null on pending)
   * so the invariant `status === 'paid' ⟹ paidAt IS NOT NULL` holds everywhere.
   * Workspace-scoped: 404 if entry does not belong to this workspace.
   */
  async update(workspaceId: number, id: number, dto: UpdateDto) {
    const entry = await MonthlyEntry.query()
      .where('workspace_id', workspaceId)
      .where('id', id)
      .firstOrFail()

    if (dto.amount !== undefined) entry.amount = dto.amount.toFixed(2)
    if (dto.status !== undefined) {
      entry.status = dto.status
      entry.paidAt = dto.status === 'paid' ? DateTime.now() : null
    }
    if (dto.note !== undefined) entry.note = dto.note

    await entry.save()
    return entry
  }
}
