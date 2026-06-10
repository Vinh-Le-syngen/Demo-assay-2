// @sys/auth/method-magiclink — declarative, side-effect-free. Imported only when used.
import type { AuthMethodDescriptor } from '../core/config'

export type MagicLinkMethodOptions = { label?: string; order?: number }

/** Passwordless email link. Capability: backend.client.magicLink. */
export function magicLinkMethod(opts: MagicLinkMethodOptions = {}): AuthMethodDescriptor {
  return {
    id: 'magicLink',
    capability: 'magicLink',
    ui: { label: opts.label ?? 'Email me a sign-in link', order: opts.order },
  }
}
