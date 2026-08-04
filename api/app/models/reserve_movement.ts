import { ReserveMovementSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import ReserveAccount from '#models/reserve_account'
import Workspace from '#models/workspace'

export default class ReserveMovement extends ReserveMovementSchema {
  @belongsTo(() => ReserveAccount)
  declare reserveAccount: BelongsTo<typeof ReserveAccount>

  @belongsTo(() => Workspace)
  declare workspace: BelongsTo<typeof Workspace>
}
