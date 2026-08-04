import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'reserve_accounts'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id')
      table
        .bigInteger('workspace_id')
        .unsigned()
        .references('id')
        .inTable('workspaces')
        .onDelete('CASCADE')

      table.string('name', 120).notNullable()
      table.string('institution', 120).nullable()
      table.string('color', 7).nullable()

      // Âncora do PRIMEIRO mês de apuração. Nenhum yield existe antes dela.
      table.date('opened_at').notNullable()

      table.decimal('goal_amount', 12, 2).nullable()
      table.date('goal_date').nullable()
      // Aporte mensal PLANEJADO — alimenta o ETA da meta sem chutar um valor.
      table.decimal('goal_monthly_contribution', 12, 2).nullable()

      table.integer('sort_order').notNullable().defaultTo(0)
      table.boolean('archived').notNullable().defaultTo(false)

      // 'YYYY-MM' do último mês JÁ APURADO. Único escritor: ReserveYieldService.
      // Existe porque meses com base zero / rendimento < R$ 0,01 não geram linha
      // de yield — sem esta coluna o banner "apuração pendente" nunca convergiria.
      table.string('last_closed_period', 7).nullable()

      table.index(['workspace_id', 'sort_order'])
      table.index(['workspace_id', 'archived'])

      table.timestamp('created_at').nullable()
      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
