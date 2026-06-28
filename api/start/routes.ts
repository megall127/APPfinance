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
