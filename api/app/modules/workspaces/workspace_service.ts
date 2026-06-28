import Workspace from '#models/workspace'
import Category from '#models/category'
import WorkspaceMember from '#models/workspace_member'
import type User from '#models/user'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { DEFAULT_CATEGORIES } from './default_categories.js'

export default class WorkspaceService {
  /**
   * Provision a workspace (with owner membership + default categories) for a user.
   *
   * If a transaction client `trx` is passed, the work runs inside the caller's
   * transaction (the caller controls atomicity). If omitted, it opens its own
   * transaction so standalone calls remain atomic.
   */
  async provisionForUser(user: User, trx?: TransactionClientContract): Promise<Workspace> {
    if (trx) {
      return this.#provision(user, trx)
    }
    return db.transaction((ownTrx) => this.#provision(user, ownTrx))
  }

  async #provision(user: User, trx: TransactionClientContract): Promise<Workspace> {
    const workspace = await Workspace.create(
      { name: `Finanças de ${user.fullName ?? 'você'}`, ownerUserId: user.id },
      { client: trx }
    )
    await WorkspaceMember.create(
      { workspaceId: workspace.id, userId: user.id, role: 'owner' },
      { client: trx }
    )
    await Category.createMany(
      DEFAULT_CATEGORIES.map((c, i) => ({ ...c, workspaceId: workspace.id, sortOrder: i })),
      { client: trx }
    )
    return workspace
  }
}
