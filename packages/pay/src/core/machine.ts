// @sys/pay — pure intent state machine + fulfilment verdict. No IO. The single source
// of truth for "what transitions are legal" and "is this intent paid enough to start work".

import type { IntentStatus, VerifiedProviderEvent } from './contract'

/** Legal transitions. Anything not listed is rejected. */
const TRANSITIONS: Record<IntentStatus, IntentStatus[]> = {
  draft: ['pending', 'canceled', 'failed'],
  pending: ['authorized', 'captured', 'failed', 'expired', 'canceled'],
  authorized: ['captured', 'canceled', 'failed'],
  captured: ['refunded', 'disputed'],
  disputed: ['captured', 'refunded'], // dispute won → back to captured; lost → refunded
  refunded: [],
  failed: [],
  expired: [],
  canceled: [],
}

const TERMINAL: ReadonlySet<IntentStatus> = new Set<IntentStatus>([
  'refunded',
  'failed',
  'expired',
  'canceled',
])

export function isTerminal(status: IntentStatus): boolean {
  return TERMINAL.has(status)
}

export function canTransition(from: IntentStatus, to: IntentStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false
}

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: IntentStatus,
    public readonly to: IntentStatus,
  ) {
    super(`@sys/pay: illegal intent transition ${from} → ${to}`)
    this.name = 'InvalidTransitionError'
  }
}

/**
 * Apply a target status. Same-status is an idempotent no-op (a re-delivered webhook for
 * a state already reached). Otherwise the transition must be legal or it throws.
 */
export function advance(from: IntentStatus, to: IntentStatus): IntentStatus {
  if (from === to) return from
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to)
  return to
}

/** Map a verified provider event to the intent status it implies. */
export function statusForEvent(ev: VerifiedProviderEvent): IntentStatus {
  switch (ev.type) {
    case 'authorized':
      return 'authorized'
    case 'captured':
      return 'captured'
    case 'failed':
      return 'failed'
    case 'expired':
      return 'expired'
    case 'canceled':
      return 'canceled'
    case 'refunded':
      return 'refunded'
    case 'dispute_opened':
      return 'disputed'
    case 'dispute_closed':
      return ev.disputeWon ? 'captured' : 'refunded'
  }
}

// ── Fulfilment verdict (Governance) ───────────────────────────────────────────────

/** Which payment state is "enough" to start the service. Policy, per product type. */
export type FulfilmentTrigger = 'authorized' | 'captured' | 'settled'

// Ordered "money progress". `settled` collapses to `captured` in v1 (no separate
// settled state yet); upgrade here when settlement tracking lands.
const PROGRESS: IntentStatus[] = ['authorized', 'captured']

function triggerStatus(trigger: FulfilmentTrigger): IntentStatus {
  return trigger === 'settled' ? 'captured' : trigger
}

/** May the service this intent paid for start, given the policy? */
export function mayFulfil(status: IntentStatus, trigger: FulfilmentTrigger): boolean {
  // A refund/dispute/failure retracts the verdict even if money was once held/taken.
  if (status === 'refunded' || status === 'disputed' || isTerminal(status)) return false
  const need = PROGRESS.indexOf(triggerStatus(trigger))
  const have = PROGRESS.indexOf(status)
  return have >= 0 && have >= need
}

/**
 * True exactly when arriving at `nextStatus` first crosses the fulfilment threshold —
 * i.e. when we should emit the outbox "start the service" message. (Edge, not level:
 * captured-after-authorized with startsOn:'authorized' must not re-fire.)
 */
export function crossesFulfilmentThreshold(
  from: IntentStatus,
  to: IntentStatus,
  trigger: FulfilmentTrigger,
): boolean {
  return !mayFulfil(from, trigger) && mayFulfil(to, trigger)
}
