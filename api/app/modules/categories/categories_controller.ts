import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import CategoryService from '#modules/categories/category_service'
import {
  createCategoryValidator,
  updateCategoryValidator,
} from '#modules/categories/category_validator'

@inject()
export default class CategoriesController {
  constructor(private categoryService: CategoryService) {}

  /**
   * GET /api/v1/categories
   * List all categories for the authenticated user's workspace.
   */
  async index({ workspace, response }: HttpContext) {
    const categories = await this.categoryService.list(Number(workspace.id))
    return response.ok(categories.map((c) => c.serialize()))
  }

  /**
   * POST /api/v1/categories
   * Create a new category in the authenticated user's workspace.
   */
  async store({ request, workspace, response }: HttpContext) {
    const data = await request.validateUsing(createCategoryValidator)
    const category = await this.categoryService.create(Number(workspace.id), data)
    return response.created(category.serialize())
  }

  /**
   * PATCH /api/v1/categories/:id
   * Update a category — only within the authenticated user's workspace (404 otherwise).
   */
  async update({ params, request, workspace, response }: HttpContext) {
    const data = await request.validateUsing(updateCategoryValidator)
    const category = await this.categoryService.update(
      Number(workspace.id),
      Number(params.id),
      data
    )
    return response.ok(category.serialize())
  }

  /**
   * DELETE /api/v1/categories/:id
   * Archive or delete a category — only within the authenticated user's workspace (404 otherwise).
   */
  async destroy({ params, workspace, response }: HttpContext) {
    const result = await this.categoryService.archiveOrDelete(
      Number(workspace.id),
      Number(params.id)
    )
    return response.ok(result)
  }
}
