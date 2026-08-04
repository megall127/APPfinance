import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'reserve_rate_periods'

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
        .bigInteger('reserve_account_id')
        .unsigned()
        .references('id')
        .inTable('reserve_accounts')
        .onDelete('CASCADE')

      table.integer('effective_year').notNullable()
      table.integer('effective_month').notNullable() // 1..12

      table.enum('rate_kind', ['monthly', 'yearly', 'cdi']).notNullable()
      // PERCENTUAL, nunca fração:
      //   0.850000 = 0,85% a.m. | 12.500000 = 12,5% a.a. | 102.000000 = 102% do CDI
      table.decimal('rate_value', 9, 6).notNullable()

      // Os nomes SAO EXPLICITOS de proposito. O padrao do Knex —
      // <tabela>_<col1>_<col2>..._unique — daria 77 e 89 caracteres aqui, e o
      // MySQL corta em 64 (erro 1059, "Identifier name is too long"). O Knex nao
      // trunca, entao a migration falharia no boot do container, e como o CMD do
      // Dockerfile e `migration:run --force && node bin/server.js`, a API inteira
      // deixaria de subir.
      table.unique(['reserve_account_id', 'effective_year', 'effective_month'], {
        indexName: 'reserve_rate_periods_account_period_unique',
      })
      table.index(
        ['workspace_id', 'reserve_account_id', 'effective_year', 'effective_month'],
        'reserve_rate_periods_ws_account_period_index'
      )

      table.timestamp('created_at').nullable()
      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
