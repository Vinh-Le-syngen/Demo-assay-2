// negative (resilience / input-validation): the pure intent machine must REJECT every
// illegal transition and bad/unsupported input — never silently coerce money state.

import { describe, it, expect } from 'vitest'
import {
  advance,
  canTransition,
  InvalidTransitionError,
  isTerminal,
} from '../core/machine'
import type { IntentStatus } from '../core/contract'

const ALL: IntentStatus[] = [
  'draft',
  'pending',
  'authorized',
  'captured',
  'refunded',
  'disputed',
  'failed',
  'expired',
  'canceled',
]

// The ONLY legal edges (mirrors the machine's TRANSITIONS table). Anything outside this
// set MUST be rejected. This is the negative complement of machine.test.ts's happy path.
const LEGAL = new Set<string>([
  'draft>pending',
  'draft>canceled',
  'draft>failed',
  'pending>authorized',
  'pending>captured',
  'pending>failed',
  'pending>expired',
  'pending>canceled',
  'authorized>captured',
  'authorized>canceled',
  'authorized>failed',
  'captured>refunded',
  'captured>disputed',
  'disputed>captured',
  'disputed>refunded',
])

describe('machine — illegal transitions are rejected (negative)', () => {
  it('canTransition is false for every edge not explicitly legal', () => {
    for (const from of ALL) {
      for (const to of ALL) {
        if (from === to) continue
        const legal = LEGAL.has(`${from}>${to}`)
        expect(canTransition(from, to), `${from} → ${to}`).toBe(legal)
      }
    }
  })

  it('advance throws InvalidTransitionError on illegal cross-edges (cannot skip the funnel)', () => {
    // Cannot capture money that was never even pending.
    expect(() => advance('draft', 'captured')).toThrow(InvalidTransitionError)
    // Cannot resurrect a terminal/refunded intent into captured.
    expect(() => advance('refunded', 'captured')).toThrow(InvalidTransitionError)
    expect(() => advance('failed', 'captured')).toThrow(InvalidTransitionError)
    expect(() => advance('canceled', 'authorized')).toThrow(InvalidTransitionError)
    // Cannot walk money backwards.
    expect(() => advance('captured', 'pending')).toThrow(InvalidTransitionError)
    expect(() => advance('authorized', 'pending')).toThrow(InvalidTransitionError)
  })

  it('the thrown error carries the offending from/to for the ledger', () => {
    try {
      advance('refunded', 'captured')
      expect.unreachable('advance should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidTransitionError)
      expect((e as InvalidTransitionError).from).toBe('refunded')
      expect((e as InvalidTransitionError).to).toBe('captured')
    }
  })

  it('terminal states have no outgoing legal transitions', () => {
    for (const t of ALL.filter(isTerminal)) {
      for (const to of ALL) {
        if (to === t) continue
        expect(canTransition(t, to), `${t} → ${to}`).toBe(false)
      }
    }
  })
})
