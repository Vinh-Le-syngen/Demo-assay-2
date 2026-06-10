import { describe, it, expect } from 'vitest'
import { createRoleScopeAccessPolicy } from '../core/access'
import type { AccessSubject, DocumentShare, VaultDocument } from '../core/contract'

const policy = createRoleScopeAccessPolicy()
const NOW = '2026-06-03T00:00:00Z'

const doc = (ownerAccountId = 'acc_1'): VaultDocument => ({
  id: 'doc_1', ownerAccountId, metadata: { category: 'passport', holder: 'p1' }, status: 'active',
  currentVersionId: 'v1', versions: [], source: 'uploaded', createdAt: NOW,
})
const subj = (s: Partial<AccessSubject>): AccessSubject => ({ actorId: 'a', role: 'client', ...s })

describe('role+scope access policy', () => {
  it('admin may do anything', () => {
    for (const action of ['view', 'download', 'replace', 'share'] as const) {
      expect(policy.decide(subj({ role: 'admin' }), doc(), action, [], NOW).allow).toBe(true)
    }
  })

  it('owner (client on the doc account) may view/download/replace/share', () => {
    const s = subj({ role: 'client', accountId: 'acc_1' })
    for (const action of ['view', 'download', 'replace', 'share'] as const) {
      expect(policy.decide(s, doc('acc_1'), action, [], NOW).allow).toBe(true)
    }
  })

  it('a client on a DIFFERENT account is denied', () => {
    const s = subj({ role: 'client', accountId: 'acc_OTHER' })
    expect(policy.decide(s, doc('acc_1'), 'view', [], NOW).allow).toBe(false)
  })

  it('assigned agent may view/download but NOT replace or share', () => {
    const s = subj({ role: 'agent', assignedAccountIds: ['acc_1'] })
    expect(policy.decide(s, doc('acc_1'), 'view', [], NOW).allow).toBe(true)
    expect(policy.decide(s, doc('acc_1'), 'download', [], NOW).allow).toBe(true)
    expect(policy.decide(s, doc('acc_1'), 'replace', [], NOW).allow).toBe(false)
    expect(policy.decide(s, doc('acc_1'), 'share', [], NOW).allow).toBe(false)
  })

  it('an UNassigned agent is denied', () => {
    const s = subj({ role: 'agent', assignedAccountIds: ['acc_OTHER'] })
    expect(policy.decide(s, doc('acc_1'), 'view', [], NOW).allow).toBe(false)
  })

  it('an explicit actor share grants ONLY the granted actions', () => {
    const share: DocumentShare = { id: 's1', documentId: 'doc_1', grantedTo: { kind: 'actor', id: 'partner_actor' }, actions: ['view'], grantedBy: 'a' }
    const s = subj({ actorId: 'partner_actor', role: 'partner' })
    expect(policy.decide(s, doc(), 'view', [share], NOW).allow).toBe(true)
    expect(policy.decide(s, doc(), 'download', [share], NOW).allow).toBe(false) // not granted
  })

  it('an EXPIRED share is denied', () => {
    const share: DocumentShare = { id: 's1', documentId: 'doc_1', grantedTo: { kind: 'actor', id: 'x' }, actions: ['view'], expiresAt: '2026-06-02T00:00:00Z', grantedBy: 'a' }
    const s = subj({ actorId: 'x', role: 'partner' })
    expect(policy.decide(s, doc(), 'view', [share], NOW).allow).toBe(false)
  })

  it('a partner share matches by partnerId', () => {
    const share: DocumentShare = { id: 's1', documentId: 'doc_1', grantedTo: { kind: 'partner', id: 'partner_42' }, actions: ['view', 'download'], grantedBy: 'a' }
    expect(policy.decide(subj({ role: 'partner', partnerId: 'partner_42' }), doc(), 'download', [share], NOW).allow).toBe(true)
    expect(policy.decide(subj({ role: 'partner', partnerId: 'partner_99' }), doc(), 'download', [share], NOW).allow).toBe(false)
  })
})
