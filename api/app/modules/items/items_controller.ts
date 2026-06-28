import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import ItemService from '#modules/items/item_service'
import {
  createItemValidator,
  listItemsQueryValidator,
  updateItemValidator,
} from '#modules/items/item_validator'

@inject()
export default class ItemsController {
  constructor(private itemService: ItemService) {}

  /**
   * GET /api/v1/items[?kind=income|expense|card_subscription]
   * List all items for the authenticated user's workspace, optionally filtered by kind.
   */
  async index({ request, workspace, response }: HttpContext) {
    const { kind } = await listItemsQueryValidator.validate(request.qs())
    const items = await this.itemService.list(Number(workspace.id), kind)
    return response.ok(items.map((i) => i.serialize()))
  }

  /**
   * POST /api/v1/items
   * Create a new item in the authenticated user's workspace.
   */
  async store({ request, workspace, response }: HttpContext) {
    const data = await request.validateUsing(createItemValidator)
    const item = await this.itemService.create(Number(workspace.id), data)
    return response.created(item.serialize())
  }

  /**
   * PATCH /api/v1/items/:id
   * Update an item — only within the authenticated user's workspace (404 otherwise).
   */
  async update({ params, request, workspace, response }: HttpContext) {
    const data = await request.validateUsing(updateItemValidator)
    const item = await this.itemService.update(Number(workspace.id), Number(params.id), data)
    return response.ok(item.serialize())
  }

  /**
   * DELETE /api/v1/items/:id
   * Deactivate or delete an item — only within the authenticated user's workspace (404 otherwise).
   * If the item has monthly_entries → set is_active=false (deactivated: true).
   * If no monthly_entries → hard delete (deleted: true).
   */
  async destroy({ params, workspace, response }: HttpContext) {
    const result = await this.itemService.deactivateOrDelete(
      Number(workspace.id),
      Number(params.id)
    )
    return response.ok(result)
  }
}
