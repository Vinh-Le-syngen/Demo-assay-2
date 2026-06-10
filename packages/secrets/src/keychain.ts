// @sys/secrets keychain adapter — the ONE impure module. Reads the macOS Keychain via the `security`
// CLI. On non-Darwin (Linux/CI/Vercel) there is no Keychain, so it reads nothing and the resolver
// falls through to env. Kept out of core.ts so the resolution logic stays pure + deterministic.
import { execFileSync } from 'node:child_process'
import { platform } from 'node:os'
import type { SecretReader } from './types'

/** True on macOS, where the `security` CLI + Keychain exist. */
export function keychainAvailable(): boolean {
  return platform() === 'darwin'
}

/**
 * A SecretReader backed by `security find-generic-password -w -s <service> -a <account>`.
 * Returns undefined for a miss (or on any non-Darwin platform / CLI error) — never throws for absence,
 * so the resolver can fall through to env.
 */
export function keychainReader(): SecretReader {
  return {
    read(service: string, account: string): string | undefined {
      if (!keychainAvailable()) return undefined
      try {
        const out = execFileSync('security', ['find-generic-password', '-w', '-s', service, '-a', account], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        })
        const value = out.replace(/\n$/, '')
        return value.length > 0 ? value : undefined
      } catch {
        return undefined // not found (security exits non-zero) or unavailable
      }
    },
  }
}
