// Governance (compliance) — DENY-PRECEDENCE / fail-closed ordering of the Control
// decision. The order is contractually: (1) authentication, (2) role resolution,
// (3) permission check. A failure at an earlier stage MUST short-circuit and MUST NOT
// be overridden by a later allow. This pins the decision pipeline ordering.

import { describe, it, expect } from 'vitest'
import { createServerAuth } from '../server/index'
import type { PermissionModel, RoleResolver, TokenVerifier } from '../core/contract'

// A permission model that would ALLOW everything if ever consulted — so any deny here
// proves an EARLIER stage short-circuited (auth or role), not the permission check.
const allowAll: PermissionModel = {
  hasAnyPermission() {
    return true
  },
}

const goodVerifier: TokenVerifier = {
  async verify(token) {
    return token === 'good'
      ? { ok: true, claims: { sub: 'u1' } }
      : { ok: false, reason: 'invalid_signature' }
  },
}

describe('governance: deny-precedence / fail-closed ordering (authz-policy)', () => {
  it('401 (unauthenticated) takes precedence over an allow-all policy', async () => {
    const roleSpy = { resolved: false }
    const roles: RoleResolver = {
      async resolve() {
        roleSpy.resolved = true
        return { role: 'admin', permissions: [], source: 'db' }
      },
    }
    const auth = createServerAuth({ verifier: goodVerifier, roles, permissions: allowAll })
    const res = await auth.authorize('bad', 'anything')
    expect(res).toMatchObject({ ok: false, status: 401, reason: 'unauthenticated' })
    // Role resolution must NOT have run for an unauthenticated principal.
    expect(roleSpy.resolved).toBe(false)
  })

  it('403 no_role takes precedence over an allow-all policy', async () => {
    let permChecked = false
    const noRole: RoleResolver = { async resolve() {
      return null
    } }
    const permSpy: PermissionModel = {
      hasAnyPermission() {
        permChecked = true
        return true
      },
    }
    const auth = createServerAuth({ verifier: goodVerifier, roles: noRole, permissions: permSpy })
    const res = await auth.authorize('good', 'anything')
    expect(res).toMatchObject({ ok: false, status: 403, reason: 'no_role' })
    // The permission model must NOT be consulted when there is no role.
    expect(permChecked).toBe(false)
  })

  it('a held role with no required permissions is allowed (open authorize)', async () => {
    const roles: RoleResolver = {
      async resolve() {
        return { role: 'client', permissions: [], source: 'db' }
      },
    }
    const denyAll: PermissionModel = { hasAnyPermission: () => false }
    // No required permissions passed → permission model is bypassed, authn+role suffices.
    const auth = createServerAuth({ verifier: goodVerifier, roles, permissions: denyAll })
    expect(await auth.authorize('good')).toMatchObject({ ok: true })
  })

  it('forbidden (403) is the terminal deny when authn+role pass but permission fails', async () => {
    const roles: RoleResolver = {
      async resolve() {
        return { role: 'client', permissions: [], source: 'db' }
      },
    }
    const denyAll: PermissionModel = { hasAnyPermission: () => false }
    const auth = createServerAuth({ verifier: goodVerifier, roles, permissions: denyAll })
    expect(await auth.authorize('good', 'admin.read')).toMatchObject({
      ok: false,
      status: 403,
      reason: 'forbidden',
    })
  })
})
