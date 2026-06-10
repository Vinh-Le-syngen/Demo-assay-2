import { describe, it, expect, beforeEach } from 'vitest'
import { createVault, VaultAccessError, type Vault } from '../core/service'
import { createRoleScopeAccessPolicy } from '../core/access'
import type { AccessSubject, AuditEvent, DocumentShare, DocumentVersion, ObjectStorage, ServiceRequestDocumentLink, VaultDocument, VaultStore } from '../core/contract'

const NOW = '2026-06-03T00:00:00Z'

class FakeStore implements VaultStore {
  docs = new Map<string, VaultDocument>()
  shares: DocumentShare[] = []
  audits: AuditEvent[] = []
  links: ServiceRequestDocumentLink[] = []
  addVersionCalls = 0
  async getDocument(id: string) { return this.docs.get(id) ?? null }
  async insertDocument(doc: VaultDocument) { this.docs.set(doc.id, doc) }
  async addVersion(documentId: string, v: DocumentVersion, _supersede: boolean) {
    this.addVersionCalls++
    const d = this.docs.get(documentId)!; d.versions.push(v); d.currentVersionId = v.id
  }
  async setStatus(id: string, status: VaultDocument['status']) { this.docs.get(id)!.status = status }
  async listForAccount(accountId: string) { return [...this.docs.values()].filter((d) => d.ownerAccountId === accountId) }
  async listShares(documentId: string) { return this.shares.filter((s) => s.documentId === documentId) }
  async insertShare(share: DocumentShare) { this.shares.push(share) }
  async insertLink(link: ServiceRequestDocumentLink) { this.links.push(link) }
  async appendAudit(e: AuditEvent) { this.audits.push(e) }
}

class FakeStorage implements ObjectStorage {
  async signUpload(key: string) { return { url: `https://up/${key}`, storageRef: key } }
  async signDownload(ref: string, ttl: number) { return `https://down/${ref}?ttl=${ttl}` }
}

const OWNER: AccessSubject = { actorId: 'u_owner', role: 'client', accountId: 'acc_1' }

let store: FakeStore
let vault: Vault
beforeEach(() => {
  store = new FakeStore()
  let n = 0
  vault = createVault({ store, storage: new FakeStorage(), accessPolicy: createRoleScopeAccessPolicy(), idFactory: () => `id_${++n}`, clock: () => NOW })
})

const commit = (subject: AccessSubject, over = {}) =>
  vault.commitUpload(subject, { ownerAccountId: 'acc_1', metadata: { category: 'passport', holder: 'p1' }, storageRef: 'acc_1/passport/x', contentHash: 'h', mimeType: 'application/pdf', sizeBytes: 100, ...over })

// NEW adversarial cases, distinct from adversarial.test.ts (which covers cross-account
// download, expired/revoked/scope-creep shares, unassigned-agent read, partner re-share,
// and case-grant direct access). Here the attack surface is the REPLACE/version-injection
// path on commitUpload — a write-side bypass, not a read-side one.
describe('vault service — adversarial (version-injection / write-path abuse)', () => {
  // protocol-misuse + resource-abuse: an attacker on another account forges replaceDocumentId
  // pointing at a victim's document to graft a malicious version. The replace gate must deny,
  // the store must NOT be mutated (no version appended, currentVersionId unchanged), and the
  // denial must be audited.
  it("a cross-account attacker cannot graft a forged version onto a victim's document", async () => {
    const victimDoc = await commit(OWNER)
    const originalCurrent = victimDoc.currentVersionId
    const attacker: AccessSubject = { actorId: 'u_evil', role: 'client', accountId: 'acc_evil' }

    await expect(
      // Note: attacker even lies about ownerAccountId to look like the owner — the replace path
      // re-fetches the real document and gates on ITS owner, so the lie is irrelevant.
      vault.commitUpload(attacker, { ownerAccountId: 'acc_evil', metadata: victimDoc.metadata, storageRef: 'evil/ref', contentHash: 'malware', mimeType: 'application/pdf', sizeBytes: 9, replaceDocumentId: victimDoc.id }),
    ).rejects.toBeInstanceOf(VaultAccessError)

    const stored = store.docs.get(victimDoc.id)!
    expect(stored.versions).toHaveLength(1) // no forged version appended
    expect(stored.versions.some((v) => v.contentHash === 'malware')).toBe(false)
    expect(stored.currentVersionId).toBe(originalCurrent) // pointer not hijacked
    expect(store.addVersionCalls).toBe(0) // the store write never even fired
    expect(store.audits.some((a) => a.action === 'replace' && !a.allowed && a.actorId === 'u_evil')).toBe(true)
  })

  // resource-abuse: an unassigned agent tries to siphon a document into an arbitrary case by
  // linkToCase. The link path gates on 'view'; an unassigned agent has no view grant, so no
  // ServiceRequestDocumentLink is persisted and the attempt is rejected.
  it('an unassigned agent cannot link a document into a case it has no access to', async () => {
    const doc = await commit(OWNER)
    const rogueAgent: AccessSubject = { actorId: 'u_rogue', role: 'agent', assignedAccountIds: ['acc_other'] }
    await expect(vault.linkToCase(rogueAgent, 'sr_exfil', doc.id, 'passport')).rejects.toBeInstanceOf(VaultAccessError)
    expect(store.links).toHaveLength(0) // nothing siphoned into a case
    expect(store.audits.some((a) => a.action === 'view' && !a.allowed && a.actorId === 'u_rogue')).toBe(true)
  })
})
