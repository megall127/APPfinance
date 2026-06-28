import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import User from '#models/user'
import WorkspaceMember from '#models/workspace_member'
import Category from '#models/category'
import WorkspaceService from '#modules/workspaces/workspace_service'

test.group('WorkspaceService – provisionForUser', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('creates workspace, member row, and 6 default categories', async ({ assert }) => {
    const user = await User.create({
      fullName: 'Test User',
      email: 'testws@example.com',
      password: 'secret123',
    })

    const service = new WorkspaceService()
    const workspace = await service.provisionForUser(user)

    // 1 workspace owned by the user with the correct name
    assert.equal(workspace.ownerUserId, user.id)
    assert.equal(workspace.name, `Finanças de Test User`)

    // workspace_members row with role='owner'
    const member = await WorkspaceMember.query()
      .where('workspaceId', Number(workspace.id))
      .where('userId', user.id)
      .firstOrFail()
    assert.equal(member.role, 'owner')

    // 6 default categories for that workspace
    const categories = await Category.query().where('workspaceId', Number(workspace.id))
    assert.lengthOf(categories, 6)
  })
})
