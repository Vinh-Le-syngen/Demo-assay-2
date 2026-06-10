// @sys/auth/method-password — declarative, side-effect-free. Imported only when used.
import type { AuthMethodDescriptor } from '../core/config'

export type PasswordMethodOptions = { label?: string; order?: number }

/** Email + password. Capability: backend.client.password. */
export function passwordMethod(opts: PasswordMethodOptions = {}): AuthMethodDescriptor {
  return {
    id: 'password',
    capability: 'password',
    ui: { label: opts.label ?? 'Email & password', order: opts.order },
  }
}
