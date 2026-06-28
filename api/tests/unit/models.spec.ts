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
