import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'reserve_movements'

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

      // opening    = saldo que JÁ existia no banco ao cadastrar (capital, não aporte)
      // deposit    = aporte
      // withdrawal = saque
      // adjustment = acerto com o extrato do banco (delta assinado; conta como RENDIMENTO)
      // yield      = rendimento apurado (só o YieldService cria)
      table.enum('kind', ['opening', 'deposit', 'withdrawal', 'adjustment', 'yield']).notNullable()

      // Data-caixa. Para kind='yield' é SEMPRE o último dia do mês de competência.
      table.date('occurred_on').notNullable()

      // VALOR ASSINADO: SUM(amount) = saldo, sem CASE WHEN.
      table.decimal('amount', 12, 2).notNullable().defaultTo(0)
      table.string('description', 180).nullable()

      // ── Memória de cálculo, congelada na linha (auditoria humana) ──────────
      table.string('yield_period', 7).nullable() // 'YYYY-MM'; NOT NULL só quando kind='yield'
      table.decimal('yield_base', 14, 6).nullable() // base ponderada EXATA (6 casas!)
      table.decimal('yield_rate_applied', 12, 10).nullable() // taxa efetiva em FRAÇÃO
      table.enum('yield_rate_kind', ['monthly', 'yearly', 'cdi']).nullable()
      table.decimal('yield_rate_source', 9, 6).nullable() // valor bruto da vigência (102.000000)
      table.decimal('yield_cdi_annual', 9, 6).nullable() // CDI a.a. usado (14.900000); null se != cdi

      // Idempotência da apuração garantida pelo BANCO, não por código.
      // NOTA: yield_period é NULLABLE e o InnoDB permite múltiplos NULLs num índice
      // único — logo depósitos/saques (yield_period = NULL) se repetem à vontade,
      // enquanto o rendimento de um mês é fisicamente único por conta.
      table.unique(['reserve_account_id', 'yield_period'])

      table.index(['reserve_account_id', 'occurred_on', 'id'])
      table.index(['workspace_id', 'occurred_on'])
      table.index(['workspace_id', 'kind', 'occurred_on'])

      table.timestamp('created_at').nullable()
      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
