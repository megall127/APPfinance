import db from '@adonisjs/lucid/services/db'

export default class DashboardService {
  /**
   * Monthly summary for the given workspace/year/month.
   * - totalDoMes  = sum of expense amounts (card_subscription excluded)
   * - jaPago      = sum of paid expenses
   * - faltaPagar  = totalDoMes - jaPago
   * - percentualPago = jaPago / totalDoMes (0 when totalDoMes is 0)
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
      .select('i.kind', 'e.status', 'i.category_id')
      .sum('e.amount as amount')
      .groupBy('i.kind', 'e.status', 'i.category_id')

    let totalDoMes = 0
    let jaPago = 0
    let receitas = 0
    let assinaturasCartao = 0

    for (const r of rows) {
      const amt = Number(r.amount)
      if (r.kind === 'expense') {
        totalDoMes += amt
        if (r.status === 'paid') jaPago += amt
      } else if (r.kind === 'income') {
        receitas += amt
      } else if (r.kind === 'card_subscription') {
        assinaturasCartao += amt
      }
    }

    const faltaPagar = totalDoMes - jaPago
    const percentualPago = totalDoMes > 0 ? jaPago / totalDoMes : 0
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
   */
  async yearly(workspaceId: number, year: number) {
    const rows = await db
      .from('monthly_entries as e')
      .join('items as i', 'i.id', 'e.item_id')
      .where('e.workspace_id', workspaceId)
      .where('e.year', year)
      .where('i.kind', 'expense')
      .select('e.month', 'e.status')
      .sum('e.amount as amount')
      .groupBy('e.month', 'e.status')

    const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, total: 0, paid: 0 }))

    for (const r of rows) {
      const m = months[r.month - 1]
      const amt = Number(r.amount)
      m.total += amt
      if (r.status === 'paid') m.paid += amt
    }

    return { months }
  }
}
