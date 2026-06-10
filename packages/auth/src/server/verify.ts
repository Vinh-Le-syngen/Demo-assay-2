// @sys/auth — token verification (Data execution under Governance policy).
//
// JWKS/asymmetric is the DEFAULT path; HS256 (shared secret) is legacy compatibility,
// enabled only when `hs256Secret` is provided. Both are local crypto checks (no
// per-request network call — the JWKS set is cached). Ported from the verified Qarar
// implementation, hardened per review (distinct expired vs malformed, iss check, skew).

import { createRemoteJWKSet, jwtVerify, decodeProtectedHeader, errors as joseErrors } from 'jose'
import type { TokenVerifier, VerifyResult } from '../core/contract'

export type SupabaseVerifyConfig = {
  /** e.g. https://<project>.supabase.co — used to locate the JWKS endpoint. */
  supabaseUrl: string
  /** Expected audience. Default: 'authenticated'. */
  audience?: string
  /** Optional issuer to enforce. */
  issuer?: string
  /**
   * Legacy HS256 shared secret. Omit to require asymmetric (JWKS) verification.
   * May be a function for lazy resolution (env injected late, rotation, per-test).
   */
  hs256Secret?: string | (() => string | undefined)
  /** Clock skew tolerance (seconds) for exp/nbf/iat. Default: 5. */
  clockToleranceSec?: number
}

export function createSupabaseVerifier(cfg: SupabaseVerifyConfig): TokenVerifier {
  const jwks = createRemoteJWKSet(new URL('/auth/v1/.well-known/jwks.json', cfg.supabaseUrl))
  const audience = cfg.audience ?? 'authenticated'
  const resolveHs256Key = (): Uint8Array | null => {
    const secret = typeof cfg.hs256Secret === 'function' ? cfg.hs256Secret() : cfg.hs256Secret
    return secret ? new TextEncoder().encode(secret) : null
  }
  const verifyOpts = {
    audience,
    ...(cfg.issuer ? { issuer: cfg.issuer } : {}),
    clockTolerance: cfg.clockToleranceSec ?? 5,
  }

  return {
    async verify(token: string): Promise<VerifyResult> {
      if (!token) return { ok: false, reason: 'missing' }

      let alg: string | undefined
      try {
        alg = decodeProtectedHeader(token).alg
      } catch {
        return { ok: false, reason: 'malformed' }
      }

      try {
        let payload
        if (alg === 'HS256') {
          // Legacy symmetric path — only if a secret is configured (resolved lazily).
          const hs256Key = resolveHs256Key()
          if (!hs256Key) return { ok: false, reason: 'invalid_signature' }
          ;({ payload } = await jwtVerify(token, hs256Key, verifyOpts))
        } else {
          // Default: asymmetric verification against the published JWKS.
          ;({ payload } = await jwtVerify(token, jwks, verifyOpts))
        }

        if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
          return { ok: false, reason: 'invalid_claims' }
        }
        return {
          ok: true,
          claims: {
            sub: payload.sub,
            email: typeof payload.email === 'string' ? payload.email : undefined,
            role: typeof payload.role === 'string' ? payload.role : undefined,
            tenant: typeof payload.tenant === 'string' ? payload.tenant : undefined,
          },
        }
      } catch (err) {
        if (err instanceof joseErrors.JWTExpired) return { ok: false, reason: 'expired' }
        if (err instanceof joseErrors.JWSSignatureVerificationFailed) {
          return { ok: false, reason: 'invalid_signature' }
        }
        if (err instanceof joseErrors.JWTClaimValidationFailed) {
          return { ok: false, reason: 'invalid_claims' }
        }
        return { ok: false, reason: 'malformed' }
      }
    },
  }
}
