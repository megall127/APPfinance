import { CdiRateSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Workspace from '#models/workspace'

export default class CdiRate extends CdiRateSchema {
  @belongsTo(() => Workspace)
  declare workspace: BelongsTo<typeof Workspace>
}
