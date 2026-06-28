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
