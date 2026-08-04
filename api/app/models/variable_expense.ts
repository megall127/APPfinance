import { VariableExpenseSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Workspace from '#models/workspace'
import Category from '#models/category'

export default class VariableExpense extends VariableExpenseSchema {
  @belongsTo(() => Workspace)
  declare workspace: BelongsTo<typeof Workspace>

  @belongsTo(() => Category)
  declare category: BelongsTo<typeof Category>
}
