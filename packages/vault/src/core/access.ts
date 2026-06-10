// Default access policy: role+scope base + explicit shares. Pure decision (no IO). The host passes
// the subject (role/scope) + the document's shares; this decides allow/deny per action.

import type { AccessDecision, AccessPolicy, AccessSubject, DocAction, DocumentShare, VaultDocument } from './contract'

const allow = (reason: string): AccessDecision => ({ allow: true, reason })
const deny = (reason: string): AccessDecision => ({ allow: false, reason })

function shareGrants(subject: AccessSubject, share: DocumentShare, action: DocAction, now: string): boolean {
  if (!share.actions.includes(action)) return false
  if (share.expiresAt && share.expiresAt <= now) return false
  const g = share.grantedTo
  if (g.kind === 'actor') return g.id === subject.actorId
  if (g.kind === 'partner') return !!subject.partnerId && g.id === subject.partnerId
  return false // 'case' grants are evaluated at link time, not direct access
}

export function createRoleScopeAccessPolicy(): AccessPolicy {
  return {
    decide(subject, doc, action, shares, now): AccessDecision {
      // Admins: full access.
      if (subject.role === 'admin') return allow('admin')

      const isOwner = subject.role === 'client' && !!subject.accountId && subject.accountId === doc.ownerAccountId
      if (isOwner) {
        // Owners manage their own docs, but cannot re-share what isn't theirs to grant beyond self.
        if (action === 'view' || action === 'download' || action === 'replace' || action === 'share') return allow('owner')
      }

      const isAssignedAgent = subject.role === 'agent' && (subject.assignedAccountIds ?? []).includes(doc.ownerAccountId)
      if (isAssignedAgent) {
        // Assigned agents read; they don't replace or re-share the customer's evidence.
        if (action === 'view' || action === 'download') return allow('assigned agent')
        return deny(`assigned agent may not ${action}`)
      }

      // Explicit share grant (partner / actor), action-scoped + expiry-checked.
      if (shares.some((s) => s.documentId === doc.id && shareGrants(subject, s, action, now))) {
        return allow('explicit share')
      }

      return deny(`no grant for role=${subject.role} action=${action}`)
    },
  }
}
