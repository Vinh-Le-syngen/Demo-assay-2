// Negative (input-validation) — malformed registries/policy injected into the composition root MUST be
// rejected at validation, never silently coerced into a permissive decision. defineGovernance parses every
// injected config through @sys/canon; a bad severity enum, a missing required field, or a wrong-typed cell
// must throw rather than degrade into "no violations / everything sellable". This guards the fail-closed
// boundary of the Control plane.

import { describe, it, expect } from 'vitest'
import { ZodError } from 'zod'
import { defineGovernance } from '../define'

describe('defineGovernance — rejects malformed injected registries (input-validation)', () => {
  it('throws on an out-of-enum restricted-claim severity (no silent drop)', () => {
    expect(() =>
      defineGovernance({ restricted: { version: 1, restricted: [{ phrase: 'x', severity: 'lethal' }] } }),
    ).toThrow(ZodError)
  })

  it('throws on a service-authority entry missing the required `country`', () => {
    expect(() =>
      defineGovernance({ serviceAuthority: { version: 1, services: { will: { may_sell: true } } } }),
    ).toThrow(ZodError)
  })

  it('throws on a wrong-typed restricted registry (object where array expected)', () => {
    expect(() =>
      defineGovernance({ restricted: { version: 1, restricted: { phrase: 'x' } } }),
    ).toThrow(ZodError)
  })

  it('throws on a choices config missing the required apex_bet', () => {
    expect(() =>
      defineGovernance({ choices: { version: 1, wedge: { country: 'AE' } } }),
    ).toThrow(ZodError)
  })

  it('throws on a non-string restricted phrase (type coercion is not allowed)', () => {
    expect(() =>
      defineGovernance({ restricted: { version: 1, restricted: [{ phrase: 42 }] } }),
    ).toThrow(ZodError)
  })
})
