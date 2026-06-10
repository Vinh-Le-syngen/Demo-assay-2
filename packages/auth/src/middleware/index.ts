// @sys/auth/middleware — Control plane, ROUTING ONLY. Decides redirects from the
// current path + session. It never makes an authorization decision (that is the
// server's job) and never parses tokens/cookies by hand — the session is read through
// the injected `readSession` seam, which must use the provider SDK.

import type { AuthUser } from '../core/contract'

/** public = always allowed; auth = login/signup pages; protected = requires a session. */
export type RouteClass = 'public' | 'auth' | 'protected'

export type RouteDecision =
  | { action: 'continue' }
  | { action: 'redirect'; to: string; reason: 'authed_on_auth_page' | 'unauthenticated' }

export interface MiddlewareSession {
  user: AuthUser | null
}

export type AuthMiddlewareConfig = {
  /** Classify a path. Routing-only; authoritative authz stays server-side. */
  classify: (path: string) => RouteClass
  /** Read the session. MUST use the provider SDK — never hand-rolled cookie/JWT parsing. */
  readSession: (request: Request) => Promise<MiddlewareSession> | MiddlewareSession
  /** Where to send unauthenticated users. Default '/auth'. */
  loginPath?: string
  /** Where to send authenticated users who hit an auth page. Default '/dashboard'. */
  authedHome?: string
  /** Query param carrying the post-login return path. Default 'returnUrl'. */
  returnUrlParam?: string
}

export interface AuthMiddleware {
  decide(path: string, request: Request): Promise<RouteDecision>
}

export function createAuthMiddleware(cfg: AuthMiddlewareConfig): AuthMiddleware {
  const loginPath = cfg.loginPath ?? '/auth'
  const authedHome = cfg.authedHome ?? '/dashboard'
  const returnUrlParam = cfg.returnUrlParam ?? 'returnUrl'

  return {
    async decide(path, request): Promise<RouteDecision> {
      const klass = cfg.classify(path)
      if (klass === 'public') return { action: 'continue' }

      const { user } = await cfg.readSession(request)

      if (klass === 'auth') {
        return user
          ? { action: 'redirect', to: authedHome, reason: 'authed_on_auth_page' }
          : { action: 'continue' }
      }

      // protected
      if (!user) {
        const to = `${loginPath}?${returnUrlParam}=${encodeURIComponent(path)}`
        return { action: 'redirect', to, reason: 'unauthenticated' }
      }
      return { action: 'continue' }
    },
  }
}
