// Integration (intra-system) — composes the REAL server-auth Control surface over the
// REAL Supabase token verifier (HS256 legacy path), wiring only the Governance seams
// (RoleResolver, PermissionModel) as stubs. Unlike the unit tests — which mock the
// verifier with a literal-string check — this asserts an end-to-end authenticate→
// authorize DECISION crossing two real components: a cryptographically signed token is
// verified by the real jose-backed verifier, its `sub` is carried into role resolution,
// and the permission model gates the outcome. Proves the Data seam and the Control
// pipeline agree on the same principal across the component boundary.

import { describe, it, expect } from 'vitest'
import { SignJWT } from 'jose'
import { createServerAuth } from '../server/index'
import { createSupabaseVerifier } from '../server/verify'
import type { PermissionModel, RoleResolver } from '../core/contract'

const SECRET = 'integration-secret-at-least-32-chars-long-pad'
const key = new TextEncoder().encode(SECRET)

// REAL verifier — same crypto path the production Supabase adapter exercises.
const verifier = createSupabaseVerifier({ supabaseUrl: 'http://localhost:54321', hs256Secret: SECRET })

// Governance seams: a small in-memory role directory + permission model.
const ROLES: Record<string, string> = { 'user-admin': 'admin', 'user-client': 'client' }
const roles: RoleResolver = {
  async resolve(userId) {
    const role = ROLES[userId]
    return role ? { role, permissions: [], source: 'db' } : null
  },
}
const ROLE_PERMS: Record<string, string[]> = {
  admin: ['admin.read', 'admin.write', 'client.read'],
  client: ['client.read'],
}
const permissions: PermissionModel = {
  hasAnyPermission(role, required) {
    const granted = ROLE_PERMS[role] ?? []
    return required.some((r) => granted.includes(r))
  },
}

const auth = createServerAuth({ verifier, roles, permissions })

function sign(sub: string, opts: { expSec?: number } = {}): Promise<string> {
  return new SignJWT({ email: `${sub}@b.com` })
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience('authenticated')
    .setIssuedAt()
    .setSubject(sub)
    .setExpirationTime(opts.expSec ?? Math.floor(Date.now() / 1000) + 3600)
    .sign(key)
}

describe('integration: real server-auth over real verifier (intra-system)', () => {
  it('a real signed token authorizes through verify → role → permission to a grant', async () => {
    const token = await sign('user-admin')
    const res = await auth.authorize(token, 'admin.write')
    expect(res.ok).toBe(true)
    if (res.ok) {
      // The principal carried by the grant is the cryptographically verified `sub`.
      expect(res.user.id).toBe('user-admin')
      expect(res.user.email).toBe('user-admin@b.com')
      expect(res.role.role).toBe('admin')
    }
  })

  it('the same verified principal is denied a permission its role lacks (403 forbidden)', async () => {
    const token = await sign('user-client')
    const res = await auth.authorize(token, 'admin.write')
    expect(res).toMatchObject({ ok: false, status: 403, reason: 'forbidden' })
  })

  it('a verified principal with no role mapping is denied at the Governance seam (403 no_role)', async () => {
    const token = await sign('user-unknown')
    const res = await auth.authorize(token, 'client.read')
    expect(res).toMatchObject({ ok: false, status: 403, reason: 'no_role' })
  })

  it('an expired real token is rejected at the Data seam before any role lookup (401)', async () => {
    let roleLookups = 0
    const spyRoles: RoleResolver = {
      async resolve(id) {
        roleLookups++
        return roles.resolve(id)
      },
    }
    const spyAuth = createServerAuth({ verifier, roles: spyRoles, permissions })
    const token = await sign('user-admin', { expSec: Math.floor(Date.now() / 1000) - 3600 })
    const res = await spyAuth.authorize(token, 'admin.read')
    expect(res).toMatchObject({ ok: false, status: 401, reason: 'unauthenticated' })
    // Verification failed → the composed pipeline must short-circuit before Governance.
    expect(roleLookups).toBe(0)
  })

  it('authenticate() alone yields the verified principal without consulting roles', async () => {
    const token = await sign('user-client')
    const user = await auth.authenticate(token)
    expect(user).toEqual({ id: 'user-client', email: 'user-client@b.com' })
  })
})
