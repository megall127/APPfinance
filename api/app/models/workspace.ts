import { WorkspaceSchema } from '#database/schema'
import { belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import User from '#models/user'
import Item from '#models/item'
import Category from '#models/category'

export default class Workspace extends WorkspaceSchema {
  @belongsTo(() => User, { foreignKey: 'ownerUserId' })
  declare owner: BelongsTo<typeof User>

  @hasMany(() => Item)
  declare items: HasMany<typeof Item>

  @hasMany(() => Category)
  declare categories: HasMany<typeof Category>
}
