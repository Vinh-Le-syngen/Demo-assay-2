// @assay area=checkpoint category=adversarial subtype.kind=protocol-misuse risk=high author=qa reviewer=infra
// Adversarial: attempts to slip a disallowed commit author past authorGate by abusing string shape
// (case games, padding, look-alike domains, sub-addressing). The gate normalises with toLowerCase
// and an exact Set membership test — it must NOT be fooled by these, and must NOT over-block the
// genuine allow-listed identity. This is the Vercel deploy-identity constraint; a bypass = a
// production deploy under a forged author.

import { describe, it, expect } from 'vitest'
import { authorGate } from '../gates'

const ALLOWED = 'sinuhe.arroyo@gmail.com'
const gate = authorGate({ allowed: [ALLOWED] })

describe('authorGate resists author-spoofing bypass attempts', () => {
  it('accepts only exact (case-insensitive) matches of the allow-listed identity', () => {
    expect(gate.run({ authorEmail: ALLOWED })).toEqual([])
    expect(gate.run({ authorEmail: 'SINUHE.ARROYO@GMAIL.COM' })).toEqual([])
  })

  it('rejects look-alike and sub-addressed variants that are not byte-equal after lowercasing', () => {
    const spoofs = [
      'sinuhe.arroyo@gmail.com.evil.test', // suffix-appended domain
      'sinuhe.arroyo+admin@gmail.com', // plus sub-addressing (distinct string)
      'sinuhe.arroyo@gmail.co', // truncated TLD
      ' sinuhe.arroyo@gmail.com', // leading whitespace padding
      'sinuhe.arroyo@gmail.com ', // trailing whitespace padding
      'sinuhe_arroyo@gmail.com', // underscore homoglyph of the dot
    ]
    for (const email of spoofs) {
      expect(gate.run({ authorEmail: email }), `must block spoof: "${email}"`).toHaveLength(1)
    }
  })

  it('an empty / whitespace-only author cannot masquerade as authorised', () => {
    // Empty string is falsy → treated as unknown (no-op), NOT as a match for the allow-list.
    expect(gate.run({ authorEmail: '' })).toEqual([])
    // A whitespace string is truthy and non-matching → blocked, never silently allowed.
    expect(gate.run({ authorEmail: '   ' })).toHaveLength(1)
  })
})
