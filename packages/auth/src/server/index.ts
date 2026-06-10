// @sys/auth/server — the Control-plane decision surface. Framework-agnostic:
// pure async primitives over a token. Framework bindings (Hono/Next) wrap these.

import type {
  AuthUser,
  AuthzResult,
  Permission,
  PermissionModel,
  RoleResolver,
  TokenVerifier,
} from '../core/contract'
import type { AuthEventSink } from '../observability/index'
import { noopSink } from '../observability/index'

export { createSupabaseVerifier } from './verify'
export type { SupabaseVerifyConfig } from './verify'

export type ServerAuthDeps = {
  /** Data seam: verifies token signature + claims. */
  verifier: TokenVerifier
  /** Governance seam: resolves the authoritative role. */
  roles: RoleResolver
  /** Governance seam: the app's permission model. */
  permissions: PermissionModel
  /** Observability seam: where auth events go. Defaults to a no-op. */
  sink?: AuthEventSink
}

export interface ServerAuth {
  /** Verify a token → principal, or null. Identity only, no authorization. */
  authenticate(token: string | null | undefined): Promise<AuthUser | null>
  /** Verify + resolve role + check permissions. The full Control decision. */
  authorize(token: string | null | undefined, ...required: Permission[]): Promise<AuthzResult>
}

const BEARER = /^Bearer\s+(.+)$/i

/** Extract a bearer token from an Authorization header value. */
export function bearer(headerValue: string | null | undefined): string | null {
  if (!headerValue) return null
  const match = BEARER.exec(headerValue)
  return match ? match[1]!.trim() : null
}

export function createServerAuth(deps: ServerAuthDeps): ServerAuth {
  const sink = deps.sink ?? noopSink

  async function authenticate(token: string | null | undefined): Promise<AuthUser | null> {
    if (!token) return null
    const result = await deps.verifier.verify(token)
    if (!result.ok) {
      if (result.reason === 'expired') sink.emit({ type: 'token.expired' })
      else if (result.reason === 'malformed') sink.emit({ type: 'token.malformed' })
      sink.emit({ type: 'authn.failure', reason: result.reason })
      return null
    }
    sink.emit({ type: 'authn.success', userId: result.claims.sub })
    return { id: result.claims.sub, email: result.claims.email }
  }

  async function authorize(
    token: string | null | undefined,
    ...required: Permission[]
  ): Promise<AuthzResult> {
    const user = await authenticate(token)
    if (!user) return { ok: false, status: 401, reason: 'unauthenticated' }

    const role = await deps.roles.resolve(user.id)
    if (!role) return { ok: false, status: 403, reason: 'no_role' }

    if (required.length > 0 && !deps.permissions.hasAnyPermission(role.role, required)) {
      sink.emit({ type: 'authz.denied', userId: user.id, role: role.role, required })
      return { ok: false, status: 403, reason: 'forbidden' }
    }

    sink.emit({ type: 'authz.granted', userId: user.id, role: role.role })
    return { ok: true, user, role }
  }

  return { authenticate, authorize }
}
