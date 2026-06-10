import { describe, it, expect } from 'vitest'
import { SignJWT } from 'jose'
import { createSupabaseVerifier } from '../server/verify'

const SECRET = 'test-secret-at-least-32-chars-long-padding'
const key = new TextEncoder().encode(SECRET)
const otherKey = new TextEncoder().encode('a-different-secret-also-32-chars-long-xx')

const verifier = createSupabaseVerifier({
  supabaseUrl: 'http://localhost:54321',
  hs256Secret: SECRET,
})

type TokenOpts = { sub?: string | null; aud?: string; expSec?: number }

function sign(k: Uint8Array, opts: TokenOpts = {}): Promise<string> {
  const jwt = new SignJWT({ email: 'a@b.com' })
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience(opts.aud ?? 'authenticated')
    .setIssuedAt()
  if (opts.sub !== null) jwt.setSubject(opts.sub ?? 'user-1')
  jwt.setExpirationTime(opts.expSec ?? Math.floor(Date.now() / 1000) + 3600)
  return jwt.sign(k)
}

describe('createSupabaseVerifier', () => {
  it('accepts a valid token and returns claims', async () => {
    const res = await verifier.verify(await sign(key))
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.claims.sub).toBe('user-1')
      expect(res.claims.email).toBe('a@b.com')
    }
  })

  it('rejects an empty token as missing', async () => {
    expect(await verifier.verify('')).toEqual({ ok: false, reason: 'missing' })
  })

  it('rejects a malformed token', async () => {
    expect(await verifier.verify('not-a-jwt')).toEqual({ ok: false, reason: 'malformed' })
  })

  it('rejects an expired token', async () => {
    const token = await sign(key, { expSec: Math.floor(Date.now() / 1000) - 3600 })
    expect(await verifier.verify(token)).toEqual({ ok: false, reason: 'expired' })
  })

  it('rejects a forged signature', async () => {
    const token = await sign(otherKey)
    expect(await verifier.verify(token)).toEqual({ ok: false, reason: 'invalid_signature' })
  })

  it('rejects a wrong audience as invalid_claims', async () => {
    const token = await sign(key, { aud: 'someone-else' })
    expect(await verifier.verify(token)).toEqual({ ok: false, reason: 'invalid_claims' })
  })

  it('rejects a token with no sub as invalid_claims', async () => {
    const token = await sign(key, { sub: null })
    expect(await verifier.verify(token)).toEqual({ ok: false, reason: 'invalid_claims' })
  })

  it('rejects an HS256 token when no secret is configured (JWKS-only)', async () => {
    const jwksOnly = createSupabaseVerifier({ supabaseUrl: 'http://localhost:54321' })
    const token = await sign(key)
    expect(await jwksOnly.verify(token)).toEqual({ ok: false, reason: 'invalid_signature' })
  })
})
