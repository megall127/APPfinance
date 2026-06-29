import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'items'

  async up() {
    this.schema.table(this.tableName, (table) => {
      table.integer('installments_total').nullable()
      table.integer('installments_paid').nullable()
    })
  }

  async down() {
    this.schema.table(this.tableName, (table) => {
      table.dropColumn('installments_total')
      table.dropColumn('installments_paid')
    })
  }
}
