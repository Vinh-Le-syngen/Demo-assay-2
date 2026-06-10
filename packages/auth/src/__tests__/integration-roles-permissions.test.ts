// Integration (cross-system) — the Control decision composed across SEPARATE backing
// systems: a token verifier (Data plane), a DB-style RoleResolver (Governance / identity
// store), and an independent PermissionModel (Governance / policy). Each is a distinct
// async-backed component here; the test asserts the server-auth orchestrator threads one
// principal through all three and that a state change in the role store (a revoked role,
// an upgraded role) is reflected in the live authorize() decision — i.e. the components
// are genuinely consulted per request, not cached into a single unit.

import { describe, it, expect } from 'vitest'
import { createServerAuth } from '../server/index'
import type { PermissionModel, RoleResolver, TokenVerifier } from '../core/contract'
import type { AuthEvent, AuthEventSink } from '../observability/index'

// Data seam: a verifier standing in for the asymmetric/JWKS backend — accepts opaque
// session ids issued by the "auth backend" and maps them to verified claims.
const SESSIONS: Record<string, { sub: string; email: string }> = {
  'sess-alice': { sub: 'alice', email: 'alice@b.com' },
  'sess-bob': { sub: 'bob', email: 'bob@b.com' },
}
const verifier: TokenVerifier = {
  async verify(token) {
    const s = SESSIONS[token]
    return s
      ? { ok: true, claims: { sub: s.sub, email: s.email } }
      : { ok: false, reason: 'invalid_signature' }
  },
}

// Governance system #1: a mutable role directory (mimics a `user_roles` DB table).
class RoleDirectory implements RoleResolver {
  private readonly table = new Map<string, string>()
  grant(userId: string, role: string) {
    this.table.set(userId, role)
  }
  revoke(userId: string) {
    this.table.delete(userId)
  }
  async resolve(userId: string) {
    const role = this.table.get(userId)
    return role ? ({ role, permissions: [], source: 'db' as const }) : null
  }
}

// Governance system #2: an independent policy model (role → permission set).
const policy: PermissionModel = {
  hasAnyPermission(role, required) {
    const grants: Record<string, string[]> = {
      admin: ['case.read', 'case.write', 'case.assign'],
      agent: ['case.read', 'case.write'],
      viewer: ['case.read'],
    }
    return required.some((p) => (grants[role] ?? []).includes(p))
  },
}

function withSink() {
  const events: AuthEvent[] = []
  const sink: AuthEventSink = { emit: (e) => events.push(e) }
  return { events, sink }
}

describe('integration: authorize across verifier + role store + policy (cross-system)', () => {
  it('threads one verified principal through all three systems to a grant', async () => {
    const dir = new RoleDirectory()
    dir.grant('alice', 'agent')
    const { events, sink } = withSink()
    const auth = createServerAuth({ verifier, roles: dir, permissions: policy, sink })

    const res = await auth.authorize('sess-alice', 'case.write')
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.user.id).toBe('alice')
      expect(res.role.role).toBe('agent')
    }
    // The grant is observed with the resolved role from the directory.
    expect(events).toContainEqual({ type: 'authz.granted', userId: 'alice', role: 'agent' })
  })

  it('a role revoked in the directory flips the SAME token from grant to 403 no_role', async () => {
    const dir = new RoleDirectory()
    dir.grant('bob', 'admin')
    const auth = createServerAuth({ verifier, roles: dir, permissions: policy })

    const before = await auth.authorize('sess-bob', 'case.assign')
    expect(before.ok).toBe(true)

    // Governance state changes between requests — the decision must follow it live.
    dir.revoke('bob')
    const after = await auth.authorize('sess-bob', 'case.assign')
    expect(after).toMatchObject({ ok: false, status: 403, reason: 'no_role' })
  })

  it('an upgraded role unlocks a previously forbidden permission for the same principal', async () => {
    const dir = new RoleDirectory()
    dir.grant('alice', 'viewer')
    const auth = createServerAuth({ verifier, roles: dir, permissions: policy })

    expect(await auth.authorize('sess-alice', 'case.write')).toMatchObject({
      ok: false,
      status: 403,
      reason: 'forbidden',
    })

    dir.grant('alice', 'agent')
    expect(await auth.authorize('sess-alice', 'case.write')).toMatchObject({ ok: true })
  })

  it('an unverifiable token never reaches the role store or policy (401, no leak)', async () => {
    let consulted = false
    const dir: RoleResolver = {
      async resolve() {
        consulted = true
        return { role: 'admin', permissions: [], source: 'db' }
      },
    }
    const auth = createServerAuth({ verifier, roles: dir, permissions: policy })
    const res = await auth.authorize('sess-forged', 'case.read')
    expect(res).toMatchObject({ ok: false, status: 401, reason: 'unauthenticated' })
    expect(consulted).toBe(false)
  })
})
