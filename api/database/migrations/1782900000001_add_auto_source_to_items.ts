import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'items'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Marca o item gerado por uma feature automatica. NULL = item normal do usuario.
      // Hoje so existe um valor possivel: 'variable_expenses'.
      table.string('auto_source', 32).nullable()

      // Um item automatico por fonte, por workspace. O InnoDB permite varios NULLs
      // num indice unico, entao os itens do usuario nao sao afetados — mesmo truque
      // usado em reserve_movements.yield_period.
      table.unique(['workspace_id', 'auto_source'], {
        indexName: 'items_workspace_auto_source_unique',
      })
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropUnique(['workspace_id', 'auto_source'], 'items_workspace_auto_source_unique')
      table.dropColumn('auto_source')
    })
  }
}
