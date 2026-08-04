import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'cdi_rates'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id')
      table
        .bigInteger('workspace_id')
        .unsigned()
        .references('id')
        .inTable('workspaces')
        .onDelete('CASCADE')

      table.integer('year').notNullable()
      table.integer('month').notNullable() // 1..12 — mês a partir do qual a taxa vale

      // CDI ANUAL em percentual: 14.900000 = 14,90% ao ano.
      table.decimal('annual_rate', 9, 6).notNullable()

      table.unique(['workspace_id', 'year', 'month'])
      table.index(['workspace_id', 'year', 'month'])

      table.timestamp('created_at').nullable()
      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
