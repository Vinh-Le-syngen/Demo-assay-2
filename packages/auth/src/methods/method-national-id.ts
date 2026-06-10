// @sys/auth/method-national-id — declarative, side-effect-free. National digital identity
// (UAE Pass, Singpass, Cl@ve, VNeID, …): per-jurisdiction OIDC that BOTH authenticates AND
// returns government-verified identity attributes — a trust boost + KYC accelerator.
// Enabled per country (UAE → uae-pass, SG → singpass). The OIDC + relying-party onboarding
// live in the backend adapter; this is the descriptor.
import type { AuthMethodDescriptor } from '../core/config'

export type NationalIdProvider = 'uae-pass' | 'singpass' | 'clave' | 'vneid'

export type NationalIdMethodOptions = {
  provider: NationalIdProvider
  label?: string
  order?: number
  /** Whether a successful sign-in also yields verified identity for KYC/AML (default true). */
  verifiedIdentity?: boolean
}

const DEFAULT_LABEL: Record<NationalIdProvider, string> = {
  'uae-pass': 'Continue with UAE Pass',
  singpass: 'Continue with Singpass',
  clave: 'Continue with Cl@ve',
  vneid: 'Continue with VNeID',
}

/** National digital identity. Capability: backend.client.nationalId. */
export function nationalIdMethod(opts: NationalIdMethodOptions): AuthMethodDescriptor {
  return {
    id: 'nationalId',
    capability: 'nationalId',
    ui: { label: opts.label ?? DEFAULT_LABEL[opts.provider], order: opts.order },
    options: { provider: opts.provider, verifiedIdentity: opts.verifiedIdentity ?? true },
  }
}
