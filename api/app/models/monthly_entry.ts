import { MonthlyEntrySchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Item from '#models/item'
import Workspace from '#models/workspace'

export default class MonthlyEntry extends MonthlyEntrySchema {
  @belongsTo(() => Item)
  declare item: BelongsTo<typeof Item>

  @belongsTo(() => Workspace)
  declare workspace: BelongsTo<typeof Workspace>
}
