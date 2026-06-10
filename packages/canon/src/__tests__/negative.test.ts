// negative (kind: input-validation) — @sys/canon. Invalid/malformed configs MUST be rejected by the
// zod record schemas before they ever reach @eng/governance. A governed framework that accepts a broken
// registry would let unverified config become "operational law", so rejection is a safety property.
// Pure, no IO.
import { describe, it, expect } from 'vitest'
import { validate } from '../core'

describe('negative/input-validation — broken registries are rejected', () => {
  it('rejects structurally invalid core configs', () => {
    // choices missing required apex_bet
    expect(validate('choices', { version: 1, wedge: { country: 'AE' } }).success).toBe(false)
    // choices missing required wedge.country
    expect(validate('choices', { version: 1, apex_bet: { statement: 's' }, wedge: {} }).success).toBe(false)
    // restricted claim with empty phrase (min(1) violated) — an empty restricted phrase would match everything
    expect(validate('restrictedClaims', { restricted: [{ phrase: '' }] }).success).toBe(false)
    // restricted claim with an out-of-enum severity
    expect(
      validate('restrictedClaims', { restricted: [{ phrase: 'guaranteed', severity: 'spicy' }] }).success,
    ).toBe(false)
    // approved claim missing required id
    expect(validate('approvedClaims', { claims: [{ text: 'x' }] }).success).toBe(false)
    // capability with non-array requires/derives (wrong type)
    expect(
      validate('capabilityInventory', { capabilities: [{ id: 'c', derives_from: 'not-an-array' }] }).success,
    ).toBe(false)
  })
})
