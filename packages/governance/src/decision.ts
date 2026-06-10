// @eng/governance — the common decision contract. One shape for CI, admin UI, agents, web publishing.
// (The full evaluate*() runtime suite is a later phase; this establishes the contract + primitive gates.)

export type GovernanceDecisionKind = 'allow' | 'deny' | 'warn' | 'requires_review'

export type GovernanceReason = {
  code: string
  message: string
  severity: 'info' | 'warning' | 'blocker'
  derivesFrom?: string[]
}

export type GovernanceSubject = {
  type: 'claim' | 'service' | 'page' | 'agent_action' | 'partner_assignment' | 'country'
  id: string
}

export type GovernanceDecision = {
  decision: GovernanceDecisionKind
  subject: GovernanceSubject
  reasons: GovernanceReason[]
  requiredActions?: string[]
  evidence?: string[]
  decidedAt: string
  policyVersion: string
}
