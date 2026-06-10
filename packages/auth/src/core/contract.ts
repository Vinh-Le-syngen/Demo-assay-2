// @sys/auth — core contract (Control + Governance). Types only; NO transport logic.
//
// These are the stable, framework-agnostic types every surface (server, client,
// middleware) consumes. The other planes are reached through the injected seam
// interfaces at the bottom — sys-auth owns Control and never owns the rest.

/** A verified principal. Built only from cryptographically verified claims. */
export type AuthUser = { id: string; email?: string }

/** App-defined; sys-auth treats role/permission as opaque strings (Governance owns meaning). */
export type Role = string
export type Permission = string

/** Result of resolving a principal's authorization context. */
export type ResolvedRole = {
  role: Role
  permissions: Permission[]
  source: 'db' | 'claims'
}

/** Verified token claims. JWT carries identity + low-cardinality hints only. */
export type Claims = {
  sub: string
  email?: string
  role?: string
  tenant?: string
}

/** Control resolves `requested`; Governance verifies `verified` against authoritative data. */
export type TenantContext = { requested: string | null; verified: boolean }

/** Verification outcome — distinct expired vs malformed for clean diagnostics. */
export type VerifyResult =
  | { ok: true; claims: Claims }
  | {
      ok: false
      reason: 'missing' | 'malformed' | 'expired' | 'invalid_signature' | 'invalid_claims'
    }

/** Authorization outcome — the Control-plane decision. */
export type AuthzResult =
  | { ok: true; user: AuthUser; role: ResolvedRole; tenant?: TenantContext }
  | { ok: false; status: 401 | 403; reason: string }

// ── Injected seams to the other planes (sys-auth integrates, does not own) ──────

/** Data plane: verify a token's signature + claims. */
export interface TokenVerifier {
  verify(token: string): Promise<VerifyResult>
}

/** Governance plane: resolve a principal's authoritative role. */
export interface RoleResolver {
  resolve(userId: string): Promise<ResolvedRole | null>
}

/** Governance plane: the app's permission model. */
export interface PermissionModel {
  hasAnyPermission(role: Role, required: Permission[]): boolean
}
