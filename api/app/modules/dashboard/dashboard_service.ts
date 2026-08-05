import db from '@adonisjs/lucid/services/db'

export default class DashboardService {
  /**
   * Monthly summary for the given workspace/year/month.
   *
   * Duas familias de despesa convivem aqui e NAO podem ser somadas na mesma
   * conta de progresso:
   *   - CONTAS do mes (itens normais): tem status, podem estar pendentes.
   *   - GASTOS AVULSOS (item espelho da aba Gastos, auto_source != null):
   *     dinheiro que ja saiu. Entram gravados como 'paid' porque de fato foram
   *     pagos, mas somados a jaPago empurravam o anel de progresso para cima
   *     sem nenhum boleto ter sido quitado ("29% pago" com tudo em aberto).
   *
   * - totalDoMes  = todas as despesas do mes (card_subscription excluido)
   * - gastosVariaveis = a parcela do total que veio da aba Gastos
   * - jaPago      = CONTAS pagas (nao inclui gasto avulso)
   * - faltaPagar  = CONTAS em aberto
   * - percentualPago = jaPago / contas do mes (0 quando nao ha contas)
   *   Invariante: jaPago + faltaPagar + gastosVariaveis === totalDoMes
   * - receitas    = sum of income amounts
   * - saldo       = receitas - totalDoMes
   * - assinaturasCartao = sum of card_subscription amounts
   * - breakdownPorCategoria = expense totals grouped by category
   */
  async monthSummary(workspaceId: number, year: number, month: number) {
    const rows = await db
      .from('monthly_entries as e')
      .join('items as i', 'i.id', 'e.item_id')
      .where('e.workspace_id', workspaceId)
      .where('e.year', year)
      .where('e.month', month)
      .select('i.kind', 'e.status', 'i.auto_source as autoSource')
      .sum('e.amount as amount')
      .groupBy('i.kind', 'e.status', 'i.auto_source')

    let totalDoMes = 0
    let gastosVariaveis = 0
    let contasDoMes = 0
    let jaPago = 0
    let receitas = 0
    let assinaturasCartao = 0

    for (const r of rows) {
      const amt = Number(r.amount)
      if (r.kind === 'expense') {
        totalDoMes += amt
        if (r.autoSource !== null) {
          gastosVariaveis += amt
        } else {
          contasDoMes += amt
          if (r.status === 'paid') jaPago += amt
        }
      } else if (r.kind === 'income') {
        receitas += amt
      } else if (r.kind === 'card_subscription') {
        assinaturasCartao += amt
      }
    }

    const faltaPagar = contasDoMes - jaPago
    const percentualPago = contasDoMes > 0 ? jaPago / contasDoMes : 0
    const saldo = receitas - totalDoMes

    const breakdown = await db
      .from('monthly_entries as e')
      .join('items as i', 'i.id', 'e.item_id')
      .leftJoin('categories as c', 'c.id', 'i.category_id')
      .where('e.workspace_id', workspaceId)
      .where('e.year', year)
      .where('e.month', month)
      .where('i.kind', 'expense')
      .select('c.id as categoryId', 'c.name', 'c.color')
      .sum('e.amount as total')
      .groupBy('c.id', 'c.name', 'c.color')

    return {
      totalDoMes,
      gastosVariaveis,
      jaPago,
      faltaPagar,
      percentualPago,
      receitas,
      saldo,
      assinaturasCartao,
      breakdownPorCategoria: breakdown.map((b) => ({
        categoryId: b.categoryId !== null ? Number(b.categoryId) : null,
        name: b.name,
        color: b.color,
        total: Number(b.total),
      })),
    }
  }

  /**
   * Yearly summary for the given workspace/year.
   * Returns exactly 12 months (1..12), each with expense total and paid amount.
   * Months with no entries return { month, total: 0, paid: 0 }.
   *
   * `paid` segue a MESMA regra do anel de progresso em monthSummary: conta paga,
   * nao gasto avulso. Sem isso a serie "Pago" do grafico anual contradiria o
   * "Ja pago" do painel Resumo, na mesma tela e para o mesmo mes.
   */
  async yearly(workspaceId: number, year: number) {
    const rows = await db
      .from('monthly_entries as e')
      .join('items as i', 'i.id', 'e.item_id')
      .where('e.workspace_id', workspaceId)
      .where('e.year', year)
      .where('i.kind', 'expense')
      .select('e.month', 'e.status', 'i.auto_source as autoSource')
      .sum('e.amount as amount')
      .groupBy('e.month', 'e.status', 'i.auto_source')

    const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, total: 0, paid: 0 }))

    for (const r of rows) {
      const m = months[r.month - 1]
      const amt = Number(r.amount)
      m.total += amt
      if (r.status === 'paid' && r.autoSource === null) m.paid += amt
    }

    return { months }
  }
}
