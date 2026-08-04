import { ReserveAccountSchema } from '#database/schema'
import { belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import Workspace from '#models/workspace'
import ReserveMovement from '#models/reserve_movement'
import ReserveRatePeriod from '#models/reserve_rate_period'

export default class ReserveAccount extends ReserveAccountSchema {
  @belongsTo(() => Workspace)
  declare workspace: BelongsTo<typeof Workspace>

  @hasMany(() => ReserveMovement)
  declare movements: HasMany<typeof ReserveMovement>

  @hasMany(() => ReserveRatePeriod)
  declare ratePeriods: HasMany<typeof ReserveRatePeriod>
}
