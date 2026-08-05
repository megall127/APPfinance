import MonthlyEntry from '#models/monthly_entry'
import Item from '#models/item'
import AutoItemReadOnlyException from '#exceptions/auto_item_read_only_exception'
import { DateTime } from 'luxon'

type UpsertDto = {
  itemId: number
  year: number
  month: number
  amount: number
  status?: 'paid' | 'pending'
  note?: string
}

type UpdateDto = {
  amount?: number
  status?: 'paid' | 'pending'
  note?: string
}

export default class EntryService {
  /**
   * Create or update a monthly entry for the given workspace.
   * Validates that the item belongs to this workspace first (404 if not).
   * Uses unique (item_id, year, month) to find or create the row.
   */
  async upsert(workspaceId: number, dto: UpsertDto) {
    const item = await Item.query()
      .where('workspace_id', workspaceId)
      .where('id', dto.itemId)
      .firstOrFail()

    // O valor do item automatico e derivado dos gastos avulsos; aceitar um upsert
    // aqui dessincronizaria o total em relacao a tabela que o originou.
    if (item.autoSource !== null) {
      throw new AutoItemReadOnlyException(
        'O valor de "Gastos do mês" é calculado pela aba Gastos e não pode ser editado aqui.'
      )
    }

    // Capture existing entry to detect status transition
    const existing = await MonthlyEntry.query()
      .where('workspace_id', workspaceId)
      .where('item_id', dto.itemId)
      .where('year', dto.year)
      .where('month', dto.month)
      .first()
    const oldStatus = existing?.status ?? 'pending'

    // Preserve the existing status/note/paidAt when the caller doesn't send them
    // (e.g. editing ONLY the amount must NOT silently un-pay a paid entry, nor
    // retract an installment).
    const newStatus = dto.status ?? existing?.status ?? 'pending'

    const entry = await MonthlyEntry.updateOrCreate(
      { itemId: item.id, year: dto.year, month: dto.month },
      {
        workspaceId,
        amount: dto.amount.toFixed(2),
        status: newStatus,
        note: dto.note ?? existing?.note ?? null,
        paidAt: newStatus === 'paid' ? (existing?.paidAt ?? DateTime.now()) : null,
      }
    )

    // Auto-advance installments when status transitions
    if (oldStatus !== 'paid' && newStatus === 'paid') {
      await this.applyInstallmentDelta(workspaceId, Number(item.id), 1)
    } else if (oldStatus === 'paid' && newStatus !== 'paid') {
      await this.applyInstallmentDelta(workspaceId, Number(item.id), -1)
    }

    return entry
  }

  /**
   * Toggle status between 'paid' and 'pending'.
   * Sets paidAt = DateTime.now() when transitioning to paid, null when transitioning to pending.
   * Workspace-scoped: 404 if entry does not belong to this workspace.
   */
  async togglePaid(workspaceId: number, id: number) {
    const entry = await MonthlyEntry.query()
      .where('workspace_id', workspaceId)
      .where('id', id)
      .firstOrFail()

    await this.assertEntryIsEditable(workspaceId, Number(entry.itemId), 'toggle')

    // Flip the status first, then derive paidAt from the NEW status
    entry.status = entry.status === 'paid' ? 'pending' : 'paid'
    entry.paidAt = entry.status === 'paid' ? DateTime.now() : null

    await entry.save()
    // Auto-advance installments counter: +1 when paid, -1 when unpaid
    await this.applyInstallmentDelta(
      workspaceId,
      Number(entry.itemId),
      entry.status === 'paid' ? 1 : -1
    )
    return entry
  }

  /**
   * Items do workspace pareados com o entry do (year, month) pedido, ou null.
   * Ordenado por sort_order ascendente.
   *
   * Entram os itens ATIVOS **e** os desativados que tenham lancamento NESTE mes.
   * A segunda metade importa: `deactivateOrDelete` desativa em vez de apagar
   * quando o item tem historico, e `applyInstallmentDelta` desativa o
   * parcelamento ao quitar a ultima parcela. Filtrando so por is_active, esses
   * lancamentos sumiam daqui mas continuavam somando no dashboard (que agrega
   * monthly_entries sem olhar is_active) — as duas telas mostravam "Total do
   * mes" diferentes para o mesmo mes, e o mes ja fechado perdia despesas reais.
   * Nos meses SEM lancamento o item desativado continua fora, que e o certo:
   * nao ha nada a pagar ali.
   */
  async monthView(workspaceId: number, year: number, month: number) {
    const entries = await MonthlyEntry.query()
      .where('workspace_id', workspaceId)
      .where('year', year)
      .where('month', month)

    const idsComLancamento = entries.map((e) => Number(e.itemId))

    const items = await Item.query()
      .where('workspace_id', workspaceId)
      .where((q) => {
        q.where('is_active', true)
        if (idsComLancamento.length > 0) q.orWhereIn('id', idsComLancamento)
      })
      .orderBy('sort_order')

    const byItem = new Map(entries.map((e) => [e.itemId, e]))

    return items.map((item) => ({ item, entry: byItem.get(item.id) ?? null }))
  }

  /**
   * Update amount, status, and/or note on an existing entry.
   * When status changes, paidAt is kept consistent (now() on paid, null on pending)
   * so the invariant `status === 'paid' ⟹ paidAt IS NOT NULL` holds everywhere.
   * Workspace-scoped: 404 if entry does not belong to this workspace.
   */
  async update(workspaceId: number, id: number, dto: UpdateDto) {
    const entry = await MonthlyEntry.query()
      .where('workspace_id', workspaceId)
      .where('id', id)
      .firstOrFail()

    await this.assertEntryIsEditable(workspaceId, Number(entry.itemId), 'edit')

    const oldStatus = entry.status // capture before mutation

    if (dto.amount !== undefined) entry.amount = dto.amount.toFixed(2)
    if (dto.status !== undefined) {
      entry.status = dto.status
      entry.paidAt = dto.status === 'paid' ? DateTime.now() : null
    }
    if (dto.note !== undefined) entry.note = dto.note

    await entry.save()

    // Auto-advance installments when status transitions
    if (dto.status !== undefined && dto.status !== oldStatus) {
      const delta = dto.status === 'paid' ? 1 : -1
      await this.applyInstallmentDelta(workspaceId, Number(entry.itemId), delta)
    }

    return entry
  }

  /**
   * Barra escrita em lancamento de item automatico (hoje so o da aba Gastos).
   * `intent` so muda a mensagem: 'toggle' fala de status, 'edit' fala de valor.
   */
  private async assertEntryIsEditable(
    workspaceId: number,
    itemId: number,
    intent: 'toggle' | 'edit'
  ) {
    const item = await Item.query().where('workspace_id', workspaceId).where('id', itemId).first()

    if (!item || item.autoSource === null) return

    throw new AutoItemReadOnlyException(
      intent === 'toggle'
        ? 'Gastos já lançados contam sempre como pagos.'
        : 'O valor de "Gastos do mês" é calculado pela aba Gastos e não pode ser editado aqui.'
    )
  }

  /**
   * Auto-advance (or retract) the installments_paid counter on the parent item.
   * Only acts when the item is an installment item (installmentsTotal != null).
   * delta = +1 when marking paid, -1 when unmarking paid.
   */
  private async applyInstallmentDelta(workspaceId: number, itemId: number, delta: number) {
    const item = await Item.query().where('workspace_id', workspaceId).where('id', itemId).first()
    if (!item || item.installmentsTotal == null) return
    const total = Number(item.installmentsTotal)
    const paid = Math.max(0, Math.min(total, Number(item.installmentsPaid ?? 0) + delta))
    item.installmentsPaid = paid
    item.isActive = paid < total // quitado → inactive; below total → active
    await item.save()
  }
}
