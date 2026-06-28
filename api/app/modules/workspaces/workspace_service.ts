import Workspace from '#models/workspace'
import Category from '#models/category'
import WorkspaceMember from '#models/workspace_member'
import type User from '#models/user'
import db from '@adonisjs/lucid/services/db'
import { DEFAULT_CATEGORIES } from './default_categories.js'

export default class WorkspaceService {
  async provisionForUser(user: User): Promise<Workspace> {
    return db.transaction(async (trx) => {
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
    })
  }
}
