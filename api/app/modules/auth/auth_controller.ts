import { inject } from '@adonisjs/core'
import db from '@adonisjs/lucid/services/db'
import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import Workspace from '#models/workspace'
import WorkspaceService from '#modules/workspaces/workspace_service'
import { registerValidator, loginValidator } from '#modules/auth/auth_validators'

@inject()
export default class AuthController {
  constructor(private workspaceService: WorkspaceService) {}

  /**
   * POST /api/v1/auth/register
   * Creates the user + provisions the workspace atomically (one transaction),
   * then issues a token. Returns 201 { user, token, workspace }.
   */
  async register({ request, response }: HttpContext) {
    const { fullName, email, password } = await request.validateUsing(registerValidator)

    // User creation and workspace provisioning share ONE transaction so a
    // failure in provisioning rolls back the user too (no orphan accounts).
    const { user, workspace } = await db.transaction(async (trx) => {
      const created = await User.create({ fullName, email, password }, { client: trx })
      const ws = await this.workspaceService.provisionForUser(created, trx)
      return { user: created, workspace: ws }
    })

    // Token creation happens after the transaction commits.
    // Token expires in 30 days (it's stored client-side in localStorage; an
    // expiry limits the window if it ever leaks via XSS).
    const token = await User.accessTokens.create(user, ['*'], { expiresIn: '30 days' })

    return response.created({
      user: user.serialize(),
      token: { value: token.value!.release() },
      workspace: workspace.serialize(),
    })
  }

  /**
   * POST /api/v1/auth/login
   * Verifies credentials, returns { user, token, workspace }
   */
  async login({ request }: HttpContext) {
    const { email, password } = await request.validateUsing(loginValidator)

    const user = await User.verifyCredentials(email, password)
    // Token expires in 30 days (it's stored client-side in localStorage; an
    // expiry limits the window if it ever leaks via XSS).
    const token = await User.accessTokens.create(user, ['*'], { expiresIn: '30 days' })
    const workspace = await this.#workspaceFor(user)

    return {
      user: user.serialize(),
      token: { value: token.value!.release() },
      workspace: workspace.serialize(),
    }
  }

  /**
   * GET /api/v1/auth/me  [auth-protected]
   * Returns the authenticated user and their workspace.
   * `ctx.workspace` is injected by CurrentWorkspaceMiddleware upstream.
   */
  async me({ auth, workspace }: HttpContext) {
    const user = auth.getUserOrFail()

    return {
      user: user.serialize(),
      workspace: workspace.serialize(),
    }
  }

  /**
   * POST /api/v1/auth/logout  [auth-protected]
   * Revokes the current access token. Behind middleware.auth() the current
   * token is always present, so we delete it unconditionally.
   */
  async logout({ auth }: HttpContext) {
    const user = auth.getUserOrFail()
    await User.accessTokens.delete(user, user.currentAccessToken!.identifier)
    return { revoked: true }
  }

  /**
   * Resolve the workspace owned by the given user. Shared by login and me.
   */
  #workspaceFor(user: User) {
    return Workspace.query().where('ownerUserId', user.id).firstOrFail()
  }
}
