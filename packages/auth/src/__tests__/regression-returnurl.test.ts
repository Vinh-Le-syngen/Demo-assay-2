// Regression (correctness, behavioral) — returnUrl preservation in the routing
// middleware. The middleware encodes the originally-requested path into the login
// redirect so the user lands back where they started after auth. These pin the exact
// encoding behavior for paths that contain query strings, reserved chars, and unicode —
// a common place for open-redirect / double-encoding bugs to creep in.

import { describe, it, expect } from 'vitest'
import { createAuthMiddleware } from '../middleware/index'
import type { MiddlewareSession } from '../middleware/index'

const req = new Request('http://localhost/')
const anon: MiddlewareSession = { user: null }

function protectedMw(returnUrlParam?: string) {
  return createAuthMiddleware({
    classify: () => 'protected',
    readSession: () => anon,
    ...(returnUrlParam ? { returnUrlParam } : {}),
  })
}

describe('regression: returnUrl preservation on protected redirect', () => {
  it('percent-encodes a path with a query string so it round-trips exactly', async () => {
    const path = '/dashboard/cases?status=open&sort=-created'
    const res = await protectedMw().decide(path, req)
    expect(res).toMatchObject({ action: 'redirect', reason: 'unauthenticated' })
    if (res.action === 'redirect') {
      const url = new URL(res.to, 'http://localhost')
      // The decoded param must equal the original path verbatim (no loss, no double-encode).
      expect(url.searchParams.get('returnUrl')).toBe(path)
    }
  })

  it('encodes reserved characters (#, &, =, space) without truncation', async () => {
    const path = '/docs/a b&c=1#frag'
    const res = await protectedMw().decide(path, req)
    if (res.action === 'redirect') {
      // The raw redirect string must not contain a literal '#' that would break the URL.
      expect(res.to).not.toContain('#frag')
      const url = new URL(res.to, 'http://localhost')
      expect(url.searchParams.get('returnUrl')).toBe(path)
    }
  })

  it('preserves a unicode path', async () => {
    const path = '/الإمارات/خدمات'
    const res = await protectedMw().decide(path, req)
    if (res.action === 'redirect') {
      const url = new URL(res.to, 'http://localhost')
      expect(url.searchParams.get('returnUrl')).toBe(path)
    }
  })

  it('honors a custom returnUrl param name while still encoding correctly', async () => {
    const path = '/dashboard/x?y=z'
    const res = await protectedMw('next').decide(path, req)
    if (res.action === 'redirect') {
      const url = new URL(res.to, 'http://localhost')
      expect(url.searchParams.get('next')).toBe(path)
      expect(url.searchParams.get('returnUrl')).toBeNull()
    }
  })
})
