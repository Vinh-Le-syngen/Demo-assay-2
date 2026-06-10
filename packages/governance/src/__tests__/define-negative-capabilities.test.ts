// Negative (input-validation) — split from define-negative.test.ts. A malformed capability inventory
// injected into the composition root MUST be rejected at validation, never silently treated as a
// backed/live capability (which would let a claim be "backed" by an invalid capability). Guards the
// fail-closed boundary of the Control plane for the capabilities registry specifically.

import { describe, it, expect } from 'vitest'
import { ZodError } from 'zod'
import { defineGovernance } from '../define'

describe('defineGovernance — malformed capability inventory rejected, never assumed live', () => {
  it('throws on an out-of-enum capability_status rather than treating it as backed', () => {
    // An unknown status must NOT pass — otherwise a claim could be "backed" by an invalid capability.
    expect(() =>
      defineGovernance({
        approved: { version: 1, claims: [{ id: 'c1', text: 'x', requires_capabilities: ['cap.f'] }] },
        capabilities: { version: 1, capabilities: [{ id: 'cap.f', capability_status: 'shipping_soon' }] },
      }),
    ).toThrow(ZodError)
  })

  it('throws on a capability missing its required id', () => {
    expect(() =>
      defineGovernance({ capabilities: { version: 1, capabilities: [{ capability_status: 'live' }] } }),
    ).toThrow(ZodError)
  })

  it('throws on a non-string capability id (type coercion is not allowed)', () => {
    expect(() =>
      defineGovernance({ capabilities: { version: 1, capabilities: [{ id: 42, capability_status: 'live' }] } }),
    ).toThrow(ZodError)
  })
})
