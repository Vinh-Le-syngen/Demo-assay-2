import { describe, it, expect } from 'vitest'
import {
  advance,
  canTransition,
  crossesFulfilmentThreshold,
  InvalidTransitionError,
  isTerminal,
  mayFulfil,
  statusForEvent,
} from '../core/machine'
import type { VerifiedProviderEvent } from '../core/contract'

const ev = (type: VerifiedProviderEvent['type'], extra: Partial<VerifiedProviderEvent> = {}): VerifiedProviderEvent => ({
  providerEventId: 'evt_1',
  type,
  providerRef: 'pi_1',
  raw: {},
  ...extra,
})

describe('transitions', () => {
  it('allows the happy path', () => {
    expect(canTransition('draft', 'pending')).toBe(true)
    expect(canTransition('pending', 'authorized')).toBe(true)
    expect(canTransition('pending', 'captured')).toBe(true)
    expect(canTransition('authorized', 'captured')).toBe(true)
    expect(canTransition('captured', 'refunded')).toBe(true)
  })

  it('rejects illegal transitions', () => {
    expect(canTransition('captured', 'pending')).toBe(false)
    expect(canTransition('refunded', 'captured')).toBe(false)
    expect(canTransition('draft', 'captured')).toBe(false)
  })

  it('advance is idempotent on same-status', () => {
    expect(advance('captured', 'captured')).toBe('captured')
  })

  it('advance throws on an illegal transition', () => {
    expect(() => advance('refunded', 'captured')).toThrow(InvalidTransitionError)
  })

  it('marks terminal states', () => {
    expect(isTerminal('refunded')).toBe(true)
    expect(isTerminal('failed')).toBe(true)
    expect(isTerminal('captured')).toBe(false)
  })
})

describe('statusForEvent', () => {
  it('maps provider events to statuses', () => {
    expect(statusForEvent(ev('authorized'))).toBe('authorized')
    expect(statusForEvent(ev('captured'))).toBe('captured')
    expect(statusForEvent(ev('refunded'))).toBe('refunded')
    expect(statusForEvent(ev('dispute_opened'))).toBe('disputed')
  })

  it('routes dispute_closed by outcome', () => {
    expect(statusForEvent(ev('dispute_closed', { disputeWon: true }))).toBe('captured')
    expect(statusForEvent(ev('dispute_closed', { disputeWon: false }))).toBe('refunded')
  })
})

describe('mayFulfil', () => {
  it('captured policy needs captured', () => {
    expect(mayFulfil('authorized', 'captured')).toBe(false)
    expect(mayFulfil('captured', 'captured')).toBe(true)
  })

  it('authorized policy accepts authorized or captured', () => {
    expect(mayFulfil('authorized', 'authorized')).toBe(true)
    expect(mayFulfil('captured', 'authorized')).toBe(true)
  })

  it('settled collapses to captured in v1', () => {
    expect(mayFulfil('captured', 'settled')).toBe(true)
    expect(mayFulfil('authorized', 'settled')).toBe(false)
  })

  it('refund/dispute/terminal retract the verdict', () => {
    expect(mayFulfil('refunded', 'captured')).toBe(false)
    expect(mayFulfil('disputed', 'captured')).toBe(false)
    expect(mayFulfil('failed', 'authorized')).toBe(false)
  })
})

describe('crossesFulfilmentThreshold (edge, not level)', () => {
  it('fires once when first crossing', () => {
    expect(crossesFulfilmentThreshold('pending', 'captured', 'captured')).toBe(true)
  })

  it('does not re-fire on captured-after-authorized when startsOn=authorized', () => {
    expect(crossesFulfilmentThreshold('pending', 'authorized', 'authorized')).toBe(true)
    expect(crossesFulfilmentThreshold('authorized', 'captured', 'authorized')).toBe(false)
  })

  it('does not fire for sub-threshold transitions', () => {
    expect(crossesFulfilmentThreshold('draft', 'pending', 'captured')).toBe(false)
  })
})
