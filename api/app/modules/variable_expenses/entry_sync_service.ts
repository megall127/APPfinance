import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Item from '#models/item'
import MonthlyEntry from '#models/monthly_entry'
import { isZeroAmount, monthRange, toAmountString } from '#modules/variable_expenses/month_range'

/** Valor de items.auto_source que identifica o item espelho dos gastos avulsos. */
export const AUTO_SOURCE = 'variable_expenses'

/** Nome inicial do item. O usuario pode renomear — a identidade e a coluna, nao o nome. */
export const AUTO_ITEM_NAME = 'Gastos do mês'

/**
 * O UNICO lugar do sistema que escreve no monthly_entry do item automatico.
 *
 * Todo caminho de escrita de variable_expenses termina aqui, e este servico e
 * idempotente: rodar syncMonth duas vezes para o mesmo mes da o mesmo resultado.
 * Nao passa por EntryService.upsert de proposito — aquele metodo mexe no contador
 * de parcelas, e o item automatico nunca e parcelado.
 */
export default class EntrySyncService {
  /** Recalcula a linha automatica de UM mes a partir da soma dos gastos. */
  async syncMonth(workspaceId: number, year: number, month: number): Promise<void> {
    const [start, end] = monthRange(year, month)

    // SUM sobre DECIMAL e exato no MySQL e volta como string pelo mysql2 —
    // nenhum float participa do caminho de escrita.
    const row = await db
      .from('variable_expenses')
      .where('workspace_id', workspaceId)
      .whereBetween('spent_on', [start, end])
      .sum('amount as total')
      .first()

    const total = toAmountString(row?.total)

    if (isZeroAmount(total)) {
      // Mes vazio: apaga a linha em vez de deixar R$ 0,00 orfao em Lancamentos.
      // Se o item nem existe (workspace que nunca lancou nada), nao cria a toa.
      const existingItem = await this.findAutoItem(workspaceId)
      if (existingItem === null) return
      await MonthlyEntry.query()
        .where('workspace_id', workspaceId)
        .where('item_id', Number(existingItem.id))
        .where('year', year)
        .where('month', month)
        .delete()
      return
    }

    const item = await this.ensureAutoItem(workspaceId)

    // paidAt e preservado: sem isso, cada gasto novo reescreveria a data de
    // pagamento do mes inteiro.
    const existing = await MonthlyEntry.query()
      .where('workspace_id', workspaceId)
      .where('item_id', Number(item.id))
      .where('year', year)
      .where('month', month)
      .first()

    await MonthlyEntry.updateOrCreate(
      { itemId: item.id, year, month },
      {
        workspaceId,
        amount: total,
        status: 'paid',
        paidAt: existing?.paidAt ?? DateTime.now(),
      }
    )
  }

  /**
   * Sincroniza todos os meses tocados por uma lista de datas, sem repetir.
   * Serve ao caso "editei a data do gasto e ele mudou de mes": os DOIS meses
   * precisam ser recalculados, ou o mes antigo fica com um total defasado.
   */
  async syncForDates(
    workspaceId: number,
    dates: Array<DateTime | string | null | undefined>
  ): Promise<void> {
    const seen = new Set<string>()

    for (const date of dates) {
      if (date === null || date === undefined) continue
      const parsed = typeof date === 'string' ? DateTime.fromISO(date) : date
      if (!parsed.isValid) continue

      const key = `${parsed.year}-${parsed.month}`
      if (seen.has(key)) continue
      seen.add(key)

      await this.syncMonth(workspaceId, parsed.year, parsed.month)
    }
  }

  /** O item espelho do workspace, ou null quando ainda nao existe. */
  async findAutoItem(workspaceId: number) {
    return Item.query().where('workspace_id', workspaceId).where('auto_source', AUTO_SOURCE).first()
  }

  /**
   * Devolve o item espelho, criando-o na primeira vez.
   * Se existir mas estiver desativado, reativa — auto-cura o caso "desativei sem
   * querer e os gastos sumiram de Lancamentos", ja que monthView filtra is_active.
   */
  private async ensureAutoItem(workspaceId: number) {
    const existing = await this.findAutoItem(workspaceId)

    if (existing !== null) {
      if (!existing.isActive) {
        existing.isActive = true
        await existing.save()
      }
      return existing
    }

    return Item.create({
      workspaceId,
      autoSource: AUTO_SOURCE,
      name: AUTO_ITEM_NAME,
      kind: 'expense',
      categoryId: null,
      defaultAmount: null,
      isActive: true,
      // Ultimo da lista: e um agregado, nao um item que o usuario planejou.
      sortOrder: 999,
      installmentsTotal: null,
      installmentsPaid: null,
    })
  }
}
