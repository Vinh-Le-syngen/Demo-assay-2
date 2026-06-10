// @sys/auth/method-oauth — declarative, side-effect-free. Imported only when used.
import type { AuthMethodDescriptor } from '../core/config'

export type OAuthProvider = 'google' | 'apple'
export type OAuthMethodOptions = {
  google?: boolean
  apple?: boolean
  label?: string
  order?: number
}

/** Social sign-in (Google/Apple). Capability: backend.client.oauth. */
export function oauthMethod(opts: OAuthMethodOptions = {}): AuthMethodDescriptor {
  const providers: OAuthProvider[] = []
  if (opts.google) providers.push('google')
  if (opts.apple) providers.push('apple')
  return {
    id: 'oauth',
    capability: 'oauth',
    ui: { label: opts.label ?? 'Continue with a provider', order: opts.order },
    options: { providers },
  }
}
