import { test } from '@japa/runner'
import Workspace from '#models/workspace'
import WorkspaceMember from '#models/workspace_member'
import Category from '#models/category'
import Item from '#models/item'
import MonthlyEntry from '#models/monthly_entry'
import User from '#models/user'

test.group('Models – relations wired', () => {
  test('Workspace: instantiate and set properties', ({ assert }) => {
    const w = new Workspace()
    w.name = 'My Workspace'
    w.ownerUserId = 1
    assert.equal(w.name, 'My Workspace')
    assert.equal(w.ownerUserId, 1)
  })

  test('Workspace has owner relation', ({ assert }) => {
    assert.isDefined(Workspace.$getRelation('owner'))
  })

  test('Workspace has items relation', ({ assert }) => {
    assert.isDefined(Workspace.$getRelation('items'))
  })

  test('Workspace has categories relation', ({ assert }) => {
    assert.isDefined(Workspace.$getRelation('categories'))
  })

  test('Category has workspace and items relations', ({ assert }) => {
    assert.isDefined(Category.$getRelation('workspace'))
    assert.isDefined(Category.$getRelation('items'))
  })

  test('Item has workspace, category, and entries relations', ({ assert }) => {
    assert.isDefined(Item.$getRelation('workspace'))
    assert.isDefined(Item.$getRelation('category'))
    assert.isDefined(Item.$getRelation('entries'))
  })

  test('MonthlyEntry has item and workspace relations', ({ assert }) => {
    assert.isDefined(MonthlyEntry.$getRelation('item'))
    assert.isDefined(MonthlyEntry.$getRelation('workspace'))
  })

  test('WorkspaceMember has workspace and user relations', ({ assert }) => {
    assert.isDefined(WorkspaceMember.$getRelation('workspace'))
    assert.isDefined(WorkspaceMember.$getRelation('user'))
  })

  test('User has workspaces relation', ({ assert }) => {
    assert.isDefined(User.$getRelation('workspaces'))
  })
})

test.group('Models – relation types', () => {
  test('Workspace.owner is a belongsTo, items/categories are hasMany', ({ assert }) => {
    assert.equal(Workspace.$getRelation('owner').type, 'belongsTo')
    assert.equal(Workspace.$getRelation('items').type, 'hasMany')
    assert.equal(Workspace.$getRelation('categories').type, 'hasMany')
  })

  test('User.workspaces is a hasMany', ({ assert }) => {
    assert.equal(User.$getRelation('workspaces').type, 'hasMany')
  })
})

test.group('Models – foreignKey on owner/workspaces', () => {
  /**
   * Lucid resolves a relation's `foreignKey` lazily inside `.boot()`, so the
   * relation MUST be booted before the property is populated (it is `undefined`
   * beforehand). We assert on the real `.foreignKey` so the test genuinely
   * fails if the `foreignKey: 'ownerUserId'` option is dropped or misspelled.
   */
  test('Workspace.owner foreignKey is ownerUserId', ({ assert }) => {
    const rel = Workspace.$getRelation('owner')
    rel.boot()
    assert.equal(rel.foreignKey, 'ownerUserId')
  })

  test('User.workspaces foreignKey is ownerUserId', ({ assert }) => {
    const rel = User.$getRelation('workspaces')
    rel.boot()
    assert.equal(rel.foreignKey, 'ownerUserId')
  })
})
