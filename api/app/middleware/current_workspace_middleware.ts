import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import Workspace from '#models/workspace'

declare module '@adonisjs/core/http' {
  interface HttpContext {
    workspace: Workspace
  }
}

/**
 * Resolves the authenticated user's first workspace and attaches it to the
 * HttpContext as `ctx.workspace`. Must run AFTER the `auth` middleware so that
 * the user is already verified and available via `ctx.auth.getUserOrFail()`.
 *
 * Tenant isolation strategy: every downstream service/controller filters queries
 * by `ctx.workspace.id`, so a Bouncer ownership policy is redundant for v1's
 * single-workspace-per-user model and has been intentionally omitted (YAGNI).
 */
export default class CurrentWorkspaceMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const user = ctx.auth.getUserOrFail()
    ctx.workspace = await user.related('workspaces').query().firstOrFail()
    return next()
  }
}
