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
     * Protected auth routes (valid bearer token required)
     */
    router
      .group(() => {
        router
          .get('me', [() => import('#modules/auth/auth_controller'), 'me'])
          .as('auth.me')
        router
          .post('logout', [() => import('#modules/auth/auth_controller'), 'logout'])
          .as('auth.logout')
      })
      .prefix('auth')
      .use(middleware.auth())
  })
  .prefix('/api/v1')
