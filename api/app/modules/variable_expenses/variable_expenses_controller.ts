import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import VariableExpenseService from '#modules/variable_expenses/variable_expense_service'
import {
  createVariableExpenseValidator,
  monthQueryValidator,
  updateVariableExpenseValidator,
} from '#modules/variable_expenses/variable_expense_validator'

/**
 * Gastos avulsos do dia a dia ("gastos da rua").
 *
 * Dinheiro no JSON: `expenses[].amount` vem direto da coluna decimal e sai como
 * STRING; `total`, `average` e `byCategory[].total` sao agregados em JS e saem
 * como NUMERO. Mesma regra do modulo de reservas.
 */
@inject()
export default class VariableExpensesController {
  constructor(private service: VariableExpenseService) {}

  /**
   * GET /api/v1/variable-expenses?year=&month=
   * Resumo do mes + lista plana dos gastos (mais recente primeiro).
   */
  async index({ request, workspace, response }: HttpContext) {
    const { year, month } = await monthQueryValidator.validate(request.qs())
    const view = await this.service.monthView(Number(workspace.id), year, month)
    return response.ok(view)
  }

  /**
   * POST /api/v1/variable-expenses
   * Cria o gasto e ressincroniza a linha automatica ANTES de responder, para que
   * o invalidateQueries do cliente ja leia o total correto.
   */
  async store({ request, workspace, response }: HttpContext) {
    const data = await request.validateUsing(createVariableExpenseValidator)
    const expense = await this.service.create(Number(workspace.id), data)
    return response.created(expense.serialize())
  }

  /**
   * PATCH /api/v1/variable-expenses/:id
   * Escopado por workspace: 404 quando o gasto e de outro.
   */
  async update({ params, request, workspace, response }: HttpContext) {
    const data = await request.validateUsing(updateVariableExpenseValidator)
    const expense = await this.service.update(Number(workspace.id), Number(params.id), data)
    return response.ok(expense.serialize())
  }

  /**
   * DELETE /api/v1/variable-expenses/:id
   * Escopado por workspace: 404 quando o gasto e de outro.
   */
  async destroy({ params, workspace, response }: HttpContext) {
    const result = await this.service.destroy(Number(workspace.id), Number(params.id))
    return response.ok(result)
  }
}
