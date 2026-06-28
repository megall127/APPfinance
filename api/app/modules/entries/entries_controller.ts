import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import EntryService from '#modules/entries/entry_service'
import {
  monthViewQueryValidator,
  upsertEntryValidator,
  updateEntryValidator,
} from '#modules/entries/entry_validator'

@inject()
export default class EntriesController {
  constructor(private entryService: EntryService) {}

  /**
   * GET /api/v1/entries?year=&month=
   * Returns all active items for the workspace paired with their monthly entry
   * (or null if no entry exists for that month).
   */
  async index({ request, workspace, response }: HttpContext) {
    const { year, month } = await monthViewQueryValidator.validate(request.qs())
    const view = await this.entryService.monthView(Number(workspace.id), year, month)
    return response.ok(
      view.map(({ item, entry }) => ({
        item: item.serialize(),
        entry: entry ? entry.serialize() : null,
      }))
    )
  }

  /**
   * POST /api/v1/entries/upsert
   * Create or update a monthly entry by unique (item_id, year, month).
   * Validates that itemId belongs to the authenticated user's workspace.
   */
  async upsert({ request, workspace, response }: HttpContext) {
    const data = await request.validateUsing(upsertEntryValidator)
    const entry = await this.entryService.upsert(Number(workspace.id), data)
    return response.ok(entry.serialize())
  }

  /**
   * POST /api/v1/entries/:id/toggle-paid
   * Flip status between 'paid' and 'pending'.
   * Sets paidAt = now() on paid, null on pending.
   * Workspace-scoped: 404 if entry does not belong to this workspace.
   */
  async togglePaid({ params, workspace, response }: HttpContext) {
    const entry = await this.entryService.togglePaid(Number(workspace.id), Number(params.id))
    return response.ok(entry.serialize())
  }

  /**
   * PATCH /api/v1/entries/:id
   * Update amount, status, and/or note.
   * Workspace-scoped: 404 if entry does not belong to this workspace.
   */
  async update({ params, request, workspace, response }: HttpContext) {
    const data = await request.validateUsing(updateEntryValidator)
    const entry = await this.entryService.update(Number(workspace.id), Number(params.id), data)
    return response.ok(entry.serialize())
  }
}
