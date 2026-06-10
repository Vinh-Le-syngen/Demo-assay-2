// @sys/release — fold findings into a decision. Mirrors @eng/governance's GovernanceDecision
// (allow/deny/warn over reasons), with a release-domain subject. Pure: the clock is injected.

import type { EvidenceRef, ReleaseDecision, ReleaseFinding, ReleaseSubject } from './types'

export interface DecideArgs {
  subject: ReleaseSubject
  findings: ReleaseFinding[]
  decidedAt: string
  policyVersion?: string
  /** promote warnings to blockers (CLI --strict). */
  strict?: boolean
  evidence?: EvidenceRef[]
}

export function decide(args: DecideArgs): ReleaseDecision {
  const blocking = args.findings.some(
    (f) => f.severity === 'blocker' || (args.strict === true && f.severity === 'warning'),
  )
  const warned = args.findings.some((f) => f.severity === 'warning')
  const decision = blocking ? 'deny' : warned ? 'warn' : 'allow'
  return {
    decision,
    subject: args.subject,
    reasons: args.findings,
    ...(args.evidence ? { evidence: args.evidence } : {}),
    decidedAt: args.decidedAt,
    policyVersion: args.policyVersion ?? 'release/1',
  }
}
