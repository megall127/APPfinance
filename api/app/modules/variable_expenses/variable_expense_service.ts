import { inject } from '@adonisjs/core'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Category from '#models/category'
import VariableExpense from '#models/variable_expense'
import EntrySyncService from '#modules/variable_expenses/entry_sync_service'
import { monthRange } from '#modules/variable_expenses/month_range'

type CreateDto = {
  amount: number
  spentOn: string
  description?: string
  categoryId?: number | null
}

type UpdateDto = {
  amount?: number
  spentOn?: string
  description?: string | null
  categoryId?: number | null
}

/** Arredonda para 2 casas depois de acumular floats, para 0.1 + 0.2 nao vazar. */
function round2(value: number): number {
  return Math.round(value * 100) / 100
}

@inject()
export default class VariableExpenseService {
  constructor(private entrySync: EntrySyncService) {}

  /**
   * Resumo do mes + lista plana dos gastos, mais recente primeiro.
   *
   * A lista vem plana de proposito: agrupar por dia e rotular "Hoje"/"Ontem" e
   * apresentacao, e mora no cliente, onde o fuso do usuario e conhecido.
   */
  async monthView(workspaceId: number, year: number, month: number) {
    const [start, end] = monthRange(year, month)

    const expenses = await VariableExpense.query()
      .where('workspace_id', workspaceId)
      .whereBetween('spent_on', [start, end])
      .orderBy('spent_on', 'desc')
      .orderBy('id', 'desc')

    const byCategoryRows = await db
      .from('variable_expenses as e')
      .leftJoin('categories as c', 'c.id', 'e.category_id')
      .where('e.workspace_id', workspaceId)
      .whereBetween('e.spent_on', [start, end])
      .select('c.id as categoryId', 'c.name', 'c.color')
      .sum('e.amount as total')
      .groupBy('c.id', 'c.name', 'c.color')

    let total = 0
    for (const expense of expenses) total += Number(expense.amount)
    total = round2(total)

    const count = expenses.length

    return {
      total,
      count,
      average: count > 0 ? round2(total / count) : 0,
      byCategory: byCategoryRows
        .map((row) => ({
          categoryId: row.categoryId !== null ? Number(row.categoryId) : null,
          name: (row.name ?? null) as string | null,
          color: (row.color ?? null) as string | null,
          total: Number(row.total),
        }))
        .sort((a, b) => b.total - a.total),
      expenses: expenses.map((expense) => expense.serialize()),
    }
  }

  async create(workspaceId: number, dto: CreateDto) {
    await this.assertCategory(workspaceId, dto.categoryId)

    const expense = await VariableExpense.create({
      workspaceId,
      categoryId: dto.categoryId ?? null,
      spentOn: DateTime.fromISO(dto.spentOn),
      amount: dto.amount.toFixed(2),
      description: dto.description ?? null,
    })

    await this.entrySync.syncForDates(workspaceId, [expense.spentOn])
    return expense
  }

  /**
   * Atualiza um gasto. Quando a data muda de mes, os DOIS meses sao
   * ressincronizados — senao o mes antigo fica com um total defasado.
   */
  async update(workspaceId: number, id: number, dto: UpdateDto) {
    const expense = await VariableExpense.query()
      .where('workspace_id', workspaceId)
      .where('id', id)
      .firstOrFail()

    await this.assertCategory(workspaceId, dto.categoryId)

    // Capturado ANTES da mutacao: e o mes que pode ficar orfao.
    const previousDate = expense.spentOn

    if (dto.amount !== undefined) expense.amount = dto.amount.toFixed(2)
    if (dto.spentOn !== undefined) expense.spentOn = DateTime.fromISO(dto.spentOn)
    if (dto.description !== undefined) expense.description = dto.description
    if (dto.categoryId !== undefined) expense.categoryId = dto.categoryId

    await expense.save()

    await this.entrySync.syncForDates(workspaceId, [previousDate, expense.spentOn])
    return expense
  }

  /** Delete de verdade: um gasto anotado errado nao tem por que virar historico. */
  async destroy(workspaceId: number, id: number) {
    const expense = await VariableExpense.query()
      .where('workspace_id', workspaceId)
      .where('id', id)
      .firstOrFail()

    const date = expense.spentOn
    await expense.delete()
    await this.entrySync.syncForDates(workspaceId, [date])

    return { deleted: true }
  }

  /** 404 quando a categoria e de outro workspace. null/undefined passam direto. */
  private async assertCategory(workspaceId: number, categoryId?: number | null) {
    if (categoryId === undefined || categoryId === null) return
    await Category.query().where('workspace_id', workspaceId).where('id', categoryId).firstOrFail()
  }
}
