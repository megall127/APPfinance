import { inject } from '@adonisjs/core'
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
   * Creates the user, provisions workspace, returns 201 { user, token, workspace }
   */
  async register({ request, response }: HttpContext) {
    const { fullName, email, password } = await request.validateUsing(registerValidator)

    const user = await User.create({ fullName, email, password })
    const workspace = await this.workspaceService.provisionForUser(user)
    const token = await User.accessTokens.create(user)

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
    const token = await User.accessTokens.create(user)
    const workspace = await Workspace.query().where('ownerUserId', user.id).firstOrFail()

    return {
      user: user.serialize(),
      token: { value: token.value!.release() },
      workspace: workspace.serialize(),
    }
  }

  /**
   * GET /api/v1/auth/me  [auth-protected]
   * Returns the authenticated user and their workspace
   */
  async me({ auth }: HttpContext) {
    const user = auth.getUserOrFail()
    const workspace = await Workspace.query().where('ownerUserId', user.id).firstOrFail()

    return {
      user: user.serialize(),
      workspace: workspace.serialize(),
    }
  }

  /**
   * POST /api/v1/auth/logout  [auth-protected]
   * Revokes the current access token
   */
  async logout({ auth }: HttpContext) {
    const user = auth.getUserOrFail()
    if (user.currentAccessToken) {
      await User.accessTokens.delete(user, user.currentAccessToken.identifier)
    }
    return { revoked: true }
  }
}
