import { describe, it, expect } from 'vitest'
import { createRoleScopeAccessPolicy } from '../core/access'
import type { AccessSubject, DocAction, DocumentShare, VaultDocument } from '../core/contract'

// Governance: additional access-control POLICY assertions on `decide`. These pin the
// role × scope × share authorisation matrix that governs document access in the vault.
const policy = createRoleScopeAccessPolicy()
const NOW = '2026-06-03T00:00:00Z'
const ALL_ACTIONS: DocAction[] = ['view', 'download', 'replace', 'share']

const doc = (ownerAccountId = 'acc_1'): VaultDocument => ({
  id: 'doc_1', ownerAccountId, metadata: { category: 'passport', holder: 'p1' }, status: 'active',
  currentVersionId: 'v1', versions: [], source: 'uploaded', createdAt: NOW,
})
const subj = (s: Partial<AccessSubject>): AccessSubject => ({ actorId: 'a', role: 'client', ...s })

describe('access policy — governance matrix (authz-policy)', () => {
  it('POLICY: admin is the only role allowed every action unconditionally', () => {
    for (const action of ALL_ACTIONS) {
      expect(policy.decide(subj({ role: 'admin' }), doc(), action, [], NOW).allow).toBe(true)
    }
  })

  it('POLICY: assigned agent is read-only — view/download allowed, replace/share denied with a reason', () => {
    const agent = subj({ role: 'agent', assignedAccountIds: ['acc_1'] })
    for (const action of ['view', 'download'] as const) {
      expect(policy.decide(agent, doc('acc_1'), action, [], NOW).allow).toBe(true)
    }
    for (const action of ['replace', 'share'] as const) {
      const decision = policy.decide(agent, doc('acc_1'), action, [], NOW)
      expect(decision.allow).toBe(false)
      expect(decision.reason).toContain(action)
    }
  })

  it('POLICY: a client whose accountId is undefined is never treated as owner', () => {
    const noAccount = subj({ role: 'client', accountId: undefined })
    for (const action of ALL_ACTIONS) {
      expect(policy.decide(noAccount, doc('acc_1'), action, [], NOW).allow).toBe(false)
    }
  })

  it('POLICY: a partner with no matching share and no scope is denied on every action', () => {
    const partner = subj({ role: 'partner', partnerId: 'partner_unknown' })
    for (const action of ALL_ACTIONS) {
      expect(policy.decide(partner, doc('acc_1'), action, [], NOW).allow).toBe(false)
    }
  })

  it('POLICY: a share is scoped to its own document — a grant on another doc does not apply', () => {
    const otherDocShare: DocumentShare = { id: 's1', documentId: 'doc_OTHER', grantedTo: { kind: 'actor', id: 'x' }, actions: ['view'], grantedBy: 'a' }
    const s = subj({ actorId: 'x', role: 'partner' })
    expect(policy.decide(s, doc(), 'view', [otherDocShare], NOW).allow).toBe(false)
  })

  it('POLICY: an actor share authorises only the named actor, not a different actor id', () => {
    const share: DocumentShare = { id: 's1', documentId: 'doc_1', grantedTo: { kind: 'actor', id: 'alice' }, actions: ['view', 'download'], grantedBy: 'a' }
    expect(policy.decide(subj({ actorId: 'alice', role: 'partner' }), doc(), 'download', [share], NOW).allow).toBe(true)
    expect(policy.decide(subj({ actorId: 'mallory', role: 'partner' }), doc(), 'download', [share], NOW).allow).toBe(false)
  })

  it('POLICY: every denial decision carries a non-empty reason (auditability of the policy)', () => {
    const stranger = subj({ role: 'client', accountId: 'acc_OTHER' })
    const decision = policy.decide(stranger, doc('acc_1'), 'view', [], NOW)
    expect(decision.allow).toBe(false)
    expect(decision.reason.length).toBeGreaterThan(0)
  })

  it('POLICY: a partner-kind share requires the subject to actually carry that partnerId', () => {
    const share: DocumentShare = { id: 's1', documentId: 'doc_1', grantedTo: { kind: 'partner', id: 'partner_42' }, actions: ['view'], grantedBy: 'a' }
    // Subject with no partnerId cannot claim a partner grant.
    expect(policy.decide(subj({ role: 'partner', partnerId: undefined }), doc(), 'view', [share], NOW).allow).toBe(false)
    expect(policy.decide(subj({ role: 'partner', partnerId: 'partner_42' }), doc(), 'view', [share], NOW).allow).toBe(true)
  })
})
