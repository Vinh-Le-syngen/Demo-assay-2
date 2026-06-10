// @sys/auth/method-passkey — declarative, side-effect-free. WebAuthn passkeys: the
// strongest passwordless method (phishing-resistant, device-bound, one-tap). Imported
// only when used. The ceremony lives in the backend adapter's `client.passkey` capability.
import type { AuthMethodDescriptor } from '../core/config'

export type PasskeyMethodOptions = {
  label?: string
  order?: number
  /** Show a "register a passkey" prompt to signed-in users who don't have one yet. */
  promptEnrollment?: boolean
}

/** Passkey (WebAuthn). Capability: backend.client.passkey. */
export function passkeyMethod(opts: PasskeyMethodOptions = {}): AuthMethodDescriptor {
  return {
    id: 'passkey',
    capability: 'passkey',
    ui: { label: opts.label ?? 'Sign in with a passkey', order: opts.order },
    options: { promptEnrollment: opts.promptEnrollment ?? false },
  }
}
