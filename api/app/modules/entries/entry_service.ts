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

    // Capture existing entry to detect status transition
    const existing = await MonthlyEntry.query()
      .where('workspace_id', workspaceId)
      .where('item_id', dto.itemId)
      .where('year', dto.year)
      .where('month', dto.month)
      .first()
    const oldStatus = existing?.status ?? 'pending'

    // Preserve the existing status/note/paidAt when the caller doesn't send them
    // (e.g. editing ONLY the amount must NOT silently un-pay a paid entry, nor
    // retract an installment).
    const newStatus = dto.status ?? existing?.status ?? 'pending'

    const entry = await MonthlyEntry.updateOrCreate(
      { itemId: item.id, year: dto.year, month: dto.month },
      {
        workspaceId,
        amount: dto.amount.toFixed(2),
        status: newStatus,
        note: dto.note ?? existing?.note ?? null,
        paidAt: newStatus === 'paid' ? (existing?.paidAt ?? DateTime.now()) : null,
      }
    )

    // Auto-advance installments when status transitions
    if (oldStatus !== 'paid' && newStatus === 'paid') {
      await this.applyInstallmentDelta(workspaceId, Number(item.id), 1)
    } else if (oldStatus === 'paid' && newStatus !== 'paid') {
      await this.applyInstallmentDelta(workspaceId, Number(item.id), -1)
    }

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
    // Auto-advance installments counter: +1 when paid, -1 when unpaid
    await this.applyInstallmentDelta(workspaceId, Number(entry.itemId), entry.status === 'paid' ? 1 : -1)
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

    const oldStatus = entry.status  // capture before mutation

    if (dto.amount !== undefined) entry.amount = dto.amount.toFixed(2)
    if (dto.status !== undefined) {
      entry.status = dto.status
      entry.paidAt = dto.status === 'paid' ? DateTime.now() : null
    }
    if (dto.note !== undefined) entry.note = dto.note

    await entry.save()

    // Auto-advance installments when status transitions
    if (dto.status !== undefined && dto.status !== oldStatus) {
      const delta = dto.status === 'paid' ? 1 : -1
      await this.applyInstallmentDelta(workspaceId, Number(entry.itemId), delta)
    }

    return entry
  }

  /**
   * Auto-advance (or retract) the installments_paid counter on the parent item.
   * Only acts when the item is an installment item (installmentsTotal != null).
   * delta = +1 when marking paid, -1 when unmarking paid.
   */
  private async applyInstallmentDelta(workspaceId: number, itemId: number, delta: number) {
    const item = await Item.query().where('workspace_id', workspaceId).where('id', itemId).first()
    if (!item || item.installmentsTotal == null) return
    const total = Number(item.installmentsTotal)
    const paid = Math.max(0, Math.min(total, Number(item.installmentsPaid ?? 0) + delta))
    item.installmentsPaid = paid
    item.isActive = paid < total // quitado → inactive; below total → active
    await item.save()
  }
}
