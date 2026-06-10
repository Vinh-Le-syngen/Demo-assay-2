// governance (compliance / process): the fulfilment-gate POLICY. "Money first, work
// second." mayFulfil() must DENY before payment is confirmed, GRANT only once the
// configured trigger (authorized | captured | settled) is reached, and RETRACT the
// moment money is returned/disputed/lost. crossesFulfilmentThreshold is edge-not-level so
// the "start the service" signal fires exactly once. This encodes the rule, not a flow.

import { describe, it, expect } from 'vitest'
import { crossesFulfilmentThreshold, mayFulfil } from '../core/machine'
import type { FulfilmentTrigger } from '../core/machine'
import type { IntentStatus } from '../core/contract'

const PRE_PAYMENT: IntentStatus[] = ['draft', 'pending']
const TRIGGERS: FulfilmentTrigger[] = ['authorized', 'captured', 'settled']

describe('fulfilment policy — deny before payment (governance)', () => {
  it('NO unpaid state may fulfil, under any trigger policy', () => {
    for (const trigger of TRIGGERS) {
      for (const status of PRE_PAYMENT) {
        expect(mayFulfil(status, trigger), `${status} @ ${trigger}`).toBe(false)
      }
    }
  })

  it('startsOn:captured requires captured — authorized (funds merely held) is NOT enough', () => {
    expect(mayFulfil('authorized', 'captured')).toBe(false)
    expect(mayFulfil('captured', 'captured')).toBe(true)
  })

  it('startsOn:authorized grants on a hold and stays granted after capture', () => {
    expect(mayFulfil('authorized', 'authorized')).toBe(true)
    expect(mayFulfil('captured', 'authorized')).toBe(true)
  })

  it('settled collapses to captured in v1 (held funds still insufficient)', () => {
    expect(mayFulfil('authorized', 'settled')).toBe(false)
    expect(mayFulfil('captured', 'settled')).toBe(true)
  })
})

describe('fulfilment policy — money returned retracts the verdict (governance)', () => {
  it('refund / dispute / any terminal state revoke the right to fulfil', () => {
    for (const trigger of TRIGGERS) {
      for (const status of ['refunded', 'disputed', 'failed', 'expired', 'canceled'] as IntentStatus[]) {
        expect(mayFulfil(status, trigger), `${status} @ ${trigger}`).toBe(false)
      }
    }
  })
})

describe('fulfilment threshold is edge-triggered, fires once (governance)', () => {
  it('fires exactly on the crossing into a fulfilling state', () => {
    expect(crossesFulfilmentThreshold('pending', 'captured', 'captured')).toBe(true)
    // already-fulfilling → fulfilling must NOT re-fire (no double start-of-service).
    expect(crossesFulfilmentThreshold('authorized', 'captured', 'authorized')).toBe(false)
  })

  it('sub-threshold and post-retraction transitions never fire the start signal', () => {
    expect(crossesFulfilmentThreshold('draft', 'pending', 'captured')).toBe(false)
    // captured → refunded crosses DOWNWARD; the start signal must not fire on a refund.
    expect(crossesFulfilmentThreshold('captured', 'refunded', 'captured')).toBe(false)
  })
})
