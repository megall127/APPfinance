import Category from '#models/category'
import Item from '#models/item'

/**
 * DTO shapes inferred from the validators.
 * Using plain types avoids circular imports with the validator module.
 */
type CreateDto = {
  name: string
  color?: string
  icon?: string
  sortOrder?: number
}

type UpdateDto = {
  name?: string
  color?: string
  icon?: string
  sortOrder?: number
}

export default class CategoryService {
  /**
   * List all categories for a workspace, ordered by sort_order ascending.
   * Only categories belonging to `workspaceId` are returned.
   */
  async list(workspaceId: number) {
    return Category.query().where('workspace_id', workspaceId).orderBy('sort_order', 'asc')
  }

  /**
   * Create a new category scoped to `workspaceId`.
   */
  async create(workspaceId: number, dto: CreateDto) {
    return Category.create({
      workspaceId,
      name: dto.name,
      color: dto.color ?? '#6B7280',
      icon: dto.icon ?? null,
      sortOrder: dto.sortOrder ?? 0,
      archived: false,
    })
  }

  /**
   * Update a category by id, scoped to `workspaceId`.
   * Throws ModelNotFoundException (→ 404) if no matching row exists for this workspace.
   */
  async update(workspaceId: number, id: number, dto: UpdateDto) {
    const category = await Category.query()
      .where('workspace_id', workspaceId)
      .where('id', id)
      .firstOrFail()

    if (dto.name !== undefined) category.name = dto.name
    if (dto.color !== undefined) category.color = dto.color
    if (dto.icon !== undefined) category.icon = dto.icon
    if (dto.sortOrder !== undefined) category.sortOrder = dto.sortOrder

    await category.save()
    return category
  }

  /**
   * Archive or delete a category scoped to `workspaceId`.
   *
   * - If items reference this category → set archived=true (soft delete).
   * - If no items reference it        → hard delete the row.
   *
   * Returns `{ archived, deleted }` to communicate the outcome.
   * Throws ModelNotFoundException (→ 404) if the category does not exist in this workspace.
   */
  async archiveOrDelete(workspaceId: number, id: number) {
    const category = await Category.query()
      .where('workspace_id', workspaceId)
      .where('id', id)
      .firstOrFail()

    const linkedItem = await Item.query().where('category_id', id).first()

    if (linkedItem !== null) {
      category.archived = true
      await category.save()
      return { archived: true, deleted: false }
    }

    await category.delete()
    return { archived: false, deleted: true }
  }
}
