import { ItemSchema } from '#database/schema'
import { belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import Workspace from '#models/workspace'
import Category from '#models/category'
import MonthlyEntry from '#models/monthly_entry'

export default class Item extends ItemSchema {
  @belongsTo(() => Workspace)
  declare workspace: BelongsTo<typeof Workspace>

  @belongsTo(() => Category)
  declare category: BelongsTo<typeof Category>

  @hasMany(() => MonthlyEntry)
  declare entries: HasMany<typeof MonthlyEntry>
}
