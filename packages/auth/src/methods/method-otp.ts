// @sys/auth/method-otp — declarative, side-effect-free. Imported only when used.
import type { AuthMethodDescriptor } from '../core/config'

export type OtpChannel = 'phone' | 'whatsapp'
export type OtpMethodOptions = { channel: OtpChannel; label?: string; order?: number }

/** One-time code over SMS or WhatsApp. Capability: backend.client.otp. */
export function otpMethod(opts: OtpMethodOptions): AuthMethodDescriptor {
  const fallback = opts.channel === 'whatsapp' ? 'WhatsApp code' : 'SMS code'
  return {
    id: 'otp',
    capability: 'otp',
    ui: { label: opts.label ?? fallback, order: opts.order },
    options: { channel: opts.channel },
  }
}
