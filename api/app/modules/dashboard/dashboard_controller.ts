import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import DashboardService from '#modules/dashboard/dashboard_service'
import {
  monthSummaryQueryValidator,
  yearlyQueryValidator,
} from '#modules/dashboard/dashboard_validator'

@inject()
export default class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  /**
   * GET /api/v1/dashboard?year=&month=
   * Returns the monthly summary for the authenticated user's workspace.
   */
  async monthSummary({ request, workspace, response }: HttpContext) {
    const { year, month } = await monthSummaryQueryValidator.validate(request.qs())
    const summary = await this.dashboardService.monthSummary(Number(workspace.id), year, month)
    return response.ok(summary)
  }

  /**
   * GET /api/v1/dashboard/yearly?year=
   * Returns 12-month expense breakdown for the given year.
   */
  async yearly({ request, workspace, response }: HttpContext) {
    const { year } = await yearlyQueryValidator.validate(request.qs())
    const result = await this.dashboardService.yearly(Number(workspace.id), year)
    return response.ok(result)
  }
}
