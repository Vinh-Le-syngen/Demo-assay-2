// @sys/sentinel — reusable probe builders. Projects compose these with their own
// active checks (DB ping, etc.) in a sentinel config.

import type { DepStatus, Probe } from './core'

/**
 * Config-presence check for a dependency we don't actively ping every call (avoids
 * hammering rate-limited APIs). all missing → not_configured; some missing → down;
 * all present → up. Pure-ish (reads process.env). Ported from SYS-SENTINEL.
 */
export function checkConfig(name: string, vars: string[]): DepStatus {
  const missing = vars.filter((v) => !process.env[v])
  if (missing.length === vars.length) {
    return { name, status: 'not_configured', detail: `missing: ${missing.join(', ')}` }
  }
  if (missing.length > 0) {
    return { name, status: 'down', detail: `missing: ${missing.join(', ')}` }
  }
  return { name, status: 'up' }
}

/** A probe that config-checks required env vars. */
export function configProbe(name: string, vars: string[]): Probe {
  return { name, run: () => checkConfig(name, vars) }
}

/** A generic HTTP liveness probe (uses global fetch). */
export function httpProbe(name: string, opts: { url: string; timeoutMs?: number }): Probe {
  return {
    name,
    async run(): Promise<DepStatus> {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 5000)
      try {
        const res = await fetch(opts.url, { signal: controller.signal })
        return res.ok
          ? { name, status: 'up' }
          : { name, status: 'down', detail: `HTTP ${res.status}` }
      } catch (e) {
        return { name, status: 'down', detail: (e as Error).message }
      } finally {
        clearTimeout(timer)
      }
    },
  }
}
