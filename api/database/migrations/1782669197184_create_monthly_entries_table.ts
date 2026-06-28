import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'monthly_entries'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id')
      table
        .bigInteger('workspace_id')
        .unsigned()
        .references('id')
        .inTable('workspaces')
        .onDelete('CASCADE')
      table
        .bigInteger('item_id')
        .unsigned()
        .references('id')
        .inTable('items')
        .onDelete('CASCADE')
      table.integer('year').notNullable()
      table.integer('month').notNullable()
      table.decimal('amount', 12, 2).notNullable().defaultTo(0)
      table.enum('status', ['paid', 'pending']).notNullable().defaultTo('pending')
      table.timestamp('paid_at').nullable()
      table.string('note').nullable()
      table.unique(['item_id', 'year', 'month'])

      table.timestamp('created_at').nullable()
      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
