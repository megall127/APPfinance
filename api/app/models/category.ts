import { CategorySchema } from '#database/schema'
import { belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import Workspace from '#models/workspace'
import Item from '#models/item'

export default class Category extends CategorySchema {
  @belongsTo(() => Workspace)
  declare workspace: BelongsTo<typeof Workspace>

  @hasMany(() => Item)
  declare items: HasMany<typeof Item>
}
