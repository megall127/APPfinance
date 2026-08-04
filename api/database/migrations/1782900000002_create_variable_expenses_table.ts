import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'variable_expenses'

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
        .bigInteger('category_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('categories')
        .onDelete('SET NULL')

      // Data-caixa do gasto. E ela — e so ela — que define o mes de competencia:
      // nao existe coluna year/month denormalizada nesta tabela.
      table.date('spent_on').notNullable()
      table.decimal('amount', 12, 2).notNullable().defaultTo(0)
      table.string('description', 180).nullable()

      // Consulta quente: "todos os gastos do mes X deste workspace".
      table.index(['workspace_id', 'spent_on'], 'variable_expenses_ws_spent_on_index')
      // Resumo por categoria dentro do mes.
      table.index(['workspace_id', 'category_id'], 'variable_expenses_ws_category_index')

      table.timestamp('created_at').nullable()
      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
