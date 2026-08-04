/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import { middleware } from '#start/kernel'
import router from '@adonisjs/core/services/router'

router.get('/', () => {
  return { hello: 'world' }
})

router
  .group(() => {
    /**
     * Public auth routes (no token required)
     */
    router
      .group(() => {
        router
          .post('register', [() => import('#modules/auth/auth_controller'), 'register'])
          .as('auth.register')
        router
          .post('login', [() => import('#modules/auth/auth_controller'), 'login'])
          .as('auth.login')
      })
      .prefix('auth')

    /**
     * Categories resource — workspace-scoped CRUD.
     * Both auth and currentWorkspace middleware run on every route in this group
     * so ctx.workspace is available to the controller without extra per-route setup.
     */
    router
      .group(() => {
        router
          .get('categories', [() => import('#modules/categories/categories_controller'), 'index'])
          .as('categories.index')
        router
          .post('categories', [() => import('#modules/categories/categories_controller'), 'store'])
          .as('categories.store')
        router
          .patch('categories/:id', [
            () => import('#modules/categories/categories_controller'),
            'update',
          ])
          .as('categories.update')
        router
          .delete('categories/:id', [
            () => import('#modules/categories/categories_controller'),
            'destroy',
          ])
          .as('categories.destroy')
      })
      .use([middleware.auth(), middleware.currentWorkspace()])

    /**
     * Items resource — workspace-scoped CRUD with kind filter.
     * Supports kind=income|expense|card_subscription query filter on GET.
     */
    router
      .group(() => {
        router
          .get('items', [() => import('#modules/items/items_controller'), 'index'])
          .as('items.index')
        router
          .post('items', [() => import('#modules/items/items_controller'), 'store'])
          .as('items.store')
        router
          .patch('items/:id', [() => import('#modules/items/items_controller'), 'update'])
          .as('items.update')
        router
          .delete('items/:id', [() => import('#modules/items/items_controller'), 'destroy'])
          .as('items.destroy')
      })
      .use([middleware.auth(), middleware.currentWorkspace()])

    /**
     * Entries resource — workspace-scoped monthly entries (upsert, toggle-paid, month view).
     * POST /entries/upsert must be registered BEFORE /:id routes to avoid param capture.
     */
    router
      .group(() => {
        router
          .get('entries', [() => import('#modules/entries/entries_controller'), 'index'])
          .as('entries.index')
        router
          .post('entries/upsert', [() => import('#modules/entries/entries_controller'), 'upsert'])
          .as('entries.upsert')
        router
          .post('entries/:id/toggle-paid', [
            () => import('#modules/entries/entries_controller'),
            'togglePaid',
          ])
          .as('entries.togglePaid')
        router
          .patch('entries/:id', [() => import('#modules/entries/entries_controller'), 'update'])
          .as('entries.update')
      })
      .use([middleware.auth(), middleware.currentWorkspace()])

    /**
     * Dashboard — workspace-scoped monthly and yearly summaries.
     * GET /dashboard?year=&month=  → monthly summary
     * GET /dashboard/yearly?year=  → 12-month expense breakdown
     * Note: /dashboard/yearly must be registered BEFORE the base /dashboard route
     * to avoid any potential prefix conflicts (though they are both GET on different paths).
     */
    router
      .group(() => {
        router
          .get('dashboard/yearly', [
            () => import('#modules/dashboard/dashboard_controller'),
            'yearly',
          ])
          .as('dashboard.yearly')
        router
          .get('dashboard', [
            () => import('#modules/dashboard/dashboard_controller'),
            'monthSummary',
          ])
          .as('dashboard.monthSummary')
      })
      .use([middleware.auth(), middleware.currentWorkspace()])

    /**
     * Import — workspace-scoped spreadsheet import (.xlsx → preview → commit).
     * Both routes accept a multipart `file` field.
     */
    router
      .group(() => {
        router
          .post('import/preview', [() => import('#modules/import/import_controller'), 'preview'])
          .as('import.preview')
        router
          .post('import/commit', [() => import('#modules/import/import_controller'), 'commit'])
          .as('import.commit')
      })
      .use([middleware.auth(), middleware.currentWorkspace()])

    /**
     * Reserves — workspace-scoped savings accounts ("caixinhas"), their signed
     * movement ledger, monthly yield accrual and the CDI reference rate.
     *
     * ORDER MATTERS: AdonisJS matches in registration order, so every literal
     * segment must come BEFORE the `:id` routes — otherwise `reserves/summary`
     * is captured as `reserves/accounts/:id` with id="summary", `Number(params.id)`
     * becomes NaN and the caller gets an unexplainable 404. Same reasoning as the
     * `entries/upsert` note above: `accounts/:id/statement` and
     * `accounts/:id/reconcile` are registered before the bare `accounts/:id`.
     */
    router
      .group(() => {
        router
          .get('reserves/summary', [
            () => import('#modules/reserves/reserves_controller'),
            'summary',
          ])
          .as('reserves.summary')
        router
          .get('reserves/cdi', [() => import('#modules/reserves/reserves_controller'), 'cdiIndex'])
          .as('reserves.cdiIndex')
        router
          .put('reserves/cdi', [() => import('#modules/reserves/reserves_controller'), 'cdiUpsert'])
          .as('reserves.cdiUpsert')
        router
          .post('reserves/yield/close', [
            () => import('#modules/reserves/reserves_controller'),
            'closeYield',
          ])
          .as('reserves.closeYield')
        router
          .get('reserves/movements', [
            () => import('#modules/reserves/reserves_controller'),
            'movementsIndex',
          ])
          .as('reserves.movementsIndex')
        router
          .post('reserves/movements', [
            () => import('#modules/reserves/reserves_controller'),
            'movementsStore',
          ])
          .as('reserves.movementsStore')
        router
          .patch('reserves/movements/:id', [
            () => import('#modules/reserves/reserves_controller'),
            'movementsUpdate',
          ])
          .as('reserves.movementsUpdate')
        router
          .delete('reserves/movements/:id', [
            () => import('#modules/reserves/reserves_controller'),
            'movementsDestroy',
          ])
          .as('reserves.movementsDestroy')
        router
          .get('reserves/accounts', [
            () => import('#modules/reserves/reserves_controller'),
            'index',
          ])
          .as('reserves.index')
        router
          .post('reserves/accounts', [
            () => import('#modules/reserves/reserves_controller'),
            'store',
          ])
          .as('reserves.store')
        router
          .get('reserves/accounts/:id/statement', [
            () => import('#modules/reserves/reserves_controller'),
            'statement',
          ])
          .as('reserves.statement')
        router
          .post('reserves/accounts/:id/reconcile', [
            () => import('#modules/reserves/reserves_controller'),
            'reconcile',
          ])
          .as('reserves.reconcile')
        router
          .patch('reserves/accounts/:id', [
            () => import('#modules/reserves/reserves_controller'),
            'update',
          ])
          .as('reserves.update')
        router
          .delete('reserves/accounts/:id', [
            () => import('#modules/reserves/reserves_controller'),
            'destroy',
          ])
          .as('reserves.destroy')
      })
      .use([middleware.auth(), middleware.currentWorkspace()])

    /**
     * Variable expenses — gastos avulsos do dia a dia ("gastos da rua").
     * O total do mes e projetado automaticamente num monthly_entry do item
     * marcado com items.auto_source = 'variable_expenses', que fica somente-leitura.
     *
     * Prefixo por extenso de proposito: `/expenses` colidiria semanticamente com
     * `items?kind=expense`, que e outra coisa.
     */
    router
      .group(() => {
        router
          .get('variable-expenses', [
            () => import('#modules/variable_expenses/variable_expenses_controller'),
            'index',
          ])
          .as('variableExpenses.index')
        router
          .post('variable-expenses', [
            () => import('#modules/variable_expenses/variable_expenses_controller'),
            'store',
          ])
          .as('variableExpenses.store')
        router
          .patch('variable-expenses/:id', [
            () => import('#modules/variable_expenses/variable_expenses_controller'),
            'update',
          ])
          .as('variableExpenses.update')
        router
          .delete('variable-expenses/:id', [
            () => import('#modules/variable_expenses/variable_expenses_controller'),
            'destroy',
          ])
          .as('variableExpenses.destroy')
      })
      .use([middleware.auth(), middleware.currentWorkspace()])

    /**
     * Protected auth routes (valid bearer token required).
     * currentWorkspace is applied per-route — only `me` needs the workspace,
     * so `logout` is spared the extra query. Resource groups (Tasks 8-11)
     * will apply [auth, currentWorkspace] at the group level instead.
     */
    router
      .group(() => {
        router
          .get('me', [() => import('#modules/auth/auth_controller'), 'me'])
          .as('auth.me')
          .use([middleware.auth(), middleware.currentWorkspace()])
        router
          .post('logout', [() => import('#modules/auth/auth_controller'), 'logout'])
          .as('auth.logout')
          .use(middleware.auth())
      })
      .prefix('auth')
  })
  .prefix('/api/v1')
