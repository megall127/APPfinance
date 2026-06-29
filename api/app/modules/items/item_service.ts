import Item from '#models/item'
import Category from '#models/category'
import MonthlyEntry from '#models/monthly_entry'

/**
 * DTO shapes inferred from the validators.
 * Using plain types avoids circular imports with the validator module.
 */
type CreateDto = {
  name: string
  kind: string
  categoryId?: number
  defaultAmount?: string
  isActive?: boolean
  sortOrder?: number
  installmentsTotal?: number
  installmentsPaid?: number
}

type UpdateDto = {
  name?: string
  kind?: string
  categoryId?: number
  defaultAmount?: string
  isActive?: boolean
  sortOrder?: number
  installmentsTotal?: number
  installmentsPaid?: number
}

export default class ItemService {
  /**
   * List all items for a workspace, ordered by sort_order ascending.
   * Optionally filter by kind (income | expense | card_subscription).
   */
  async list(workspaceId: number, kind?: string) {
    const query = Item.query().where('workspace_id', workspaceId).orderBy('sort_order', 'asc')

    if (kind !== undefined) {
      query.where('kind', kind)
    }

    return query
  }

  /**
   * Create a new item scoped to `workspaceId`.
   * If categoryId is provided, verifies it belongs to the same workspace (404 if not).
   */
  async create(workspaceId: number, dto: CreateDto) {
    if (dto.categoryId !== undefined) {
      await Category.query()
        .where('workspace_id', workspaceId)
        .where('id', dto.categoryId)
        .firstOrFail()
    }

    // Installments logic
    let installmentsTotal: number | null = dto.installmentsTotal ?? null
    let installmentsPaid: number | null = null
    if (installmentsTotal != null) {
      installmentsPaid = dto.installmentsPaid ?? 0
      installmentsPaid = Math.max(0, Math.min(installmentsTotal, installmentsPaid))
    }

    // Determine isActive:
    // - For installment items: active if paid < total (quitado → inactive)
    // - For non-installment items: use dto.isActive (default true)
    const isActive = installmentsTotal != null
      ? installmentsPaid! < installmentsTotal
      : (dto.isActive ?? true)

    return Item.create({
      workspaceId,
      name: dto.name,
      kind: dto.kind,
      categoryId: dto.categoryId ?? null,
      defaultAmount: dto.defaultAmount ?? null,
      isActive: isActive,
      sortOrder: dto.sortOrder ?? 0,
      installmentsTotal: installmentsTotal,
      installmentsPaid: installmentsPaid,
    })
  }

  /**
   * Update an item by id, scoped to `workspaceId`.
   * Throws ModelNotFoundException (→ 404) if no matching row exists for this workspace.
   * If categoryId is provided, verifies it belongs to the same workspace (404 if not).
   */
  async update(workspaceId: number, id: number, dto: UpdateDto) {
    const item = await Item.query()
      .where('workspace_id', workspaceId)
      .where('id', id)
      .firstOrFail()

    if (dto.categoryId !== undefined) {
      await Category.query()
        .where('workspace_id', workspaceId)
        .where('id', dto.categoryId)
        .firstOrFail()
    }

    // Installments update logic
    if (dto.installmentsTotal !== undefined) {
      const total = dto.installmentsTotal
      item.installmentsTotal = total
      // When total changes, re-clamp paid
      const currentPaid = dto.installmentsPaid ?? Number(item.installmentsPaid ?? 0)
      item.installmentsPaid = Math.max(0, Math.min(total, currentPaid))
      // Quitado: if installment item, isActive = paid < total
      if (dto.isActive === undefined) {
        item.isActive = item.installmentsPaid < total
      }
    } else if (dto.installmentsPaid !== undefined) {
      // Only paid changed (total unchanged)
      const total = Number(item.installmentsTotal ?? 0)
      item.installmentsPaid = Math.max(0, Math.min(total, dto.installmentsPaid))
      if (dto.isActive === undefined && item.installmentsTotal != null) {
        item.isActive = item.installmentsPaid < Number(item.installmentsTotal)
      }
    }

    if (dto.name !== undefined) item.name = dto.name
    if (dto.kind !== undefined) item.kind = dto.kind
    if (dto.categoryId !== undefined) item.categoryId = dto.categoryId
    if (dto.defaultAmount !== undefined) item.defaultAmount = dto.defaultAmount
    if (dto.isActive !== undefined) item.isActive = dto.isActive
    if (dto.sortOrder !== undefined) item.sortOrder = dto.sortOrder

    await item.save()
    return item
  }

  /**
   * Deactivate or delete an item scoped to `workspaceId`.
   *
   * - If the item has monthly_entries → set is_active=false (soft disable).
   * - If no monthly_entries              → hard delete the row.
   *
   * Returns `{ deactivated, deleted }` to communicate the outcome.
   * Throws ModelNotFoundException (→ 404) if the item does not exist in this workspace.
   */
  async deactivateOrDelete(workspaceId: number, id: number) {
    const item = await Item.query()
      .where('workspace_id', workspaceId)
      .where('id', id)
      .firstOrFail()

    const linkedEntry = await MonthlyEntry.query()
      .where('item_id', id)
      .where('workspace_id', workspaceId)
      .first()

    if (linkedEntry !== null) {
      item.isActive = false
      await item.save()
      return { deactivated: true, deleted: false }
    }

    await item.delete()
    return { deactivated: false, deleted: true }
  }
}
