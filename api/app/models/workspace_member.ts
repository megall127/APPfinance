import { WorkspaceMemberSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Workspace from '#models/workspace'
import User from '#models/user'

export default class WorkspaceMember extends WorkspaceMemberSchema {
  @belongsTo(() => Workspace)
  declare workspace: BelongsTo<typeof Workspace>

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>
}
