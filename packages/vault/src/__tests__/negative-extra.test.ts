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
  async getDocument(id: string) { return this.docs.get(id) ?? null }
  async insertDocument(doc: VaultDocument) { this.docs.set(doc.id, doc) }
  async addVersion(documentId: string, v: DocumentVersion, _supersede: boolean) {
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

// NEW negative cases, distinct from negative.test.ts (which covers: unknown-doc ops, a CLIENT
// stranger's requestUpload/replace, an assigned-agent replace, and the no-delete surface).
// Here: the write gate (`canWrite`) against the PARTNER role, which can never create or
// replace evidence for an account regardless of any share.
describe('vault service — negative (write-gate by role)', () => {
  // authz: a partner role is not an account writer — commitUpload (new doc) must be denied.
  it('a partner cannot commit a NEW upload for an account (authz: not a writer role)', async () => {
    const partner: AccessSubject = { actorId: 'u_p', role: 'partner', partnerId: 'partner_7' }
    await expect(
      vault.commitUpload(partner, { ownerAccountId: 'acc_1', metadata: { category: 'passport', holder: 'p1' }, storageRef: 'r', contentHash: 'h', mimeType: 'application/pdf', sizeBytes: 1 }),
    ).rejects.toBeInstanceOf(VaultAccessError)
    // Nothing was persisted: no document created, no upload audited.
    expect(store.docs.size).toBe(0)
    expect(store.audits.some((a) => a.action === 'upload')).toBe(false)
  })

  // authz: a partner holding a view/download share has NO replace grant. The replace path
  // gates on action 'replace'; the share does not cover it, so the partner is denied — a
  // share is not a license to mutate the owner's evidence.
  it('a partner with a view/download share cannot replace the document (authz: share omits replace)', async () => {
    const doc = await vault.commitUpload(OWNER, { ownerAccountId: 'acc_1', metadata: { category: 'passport', holder: 'p1' }, storageRef: 'acc_1/passport/x', contentHash: 'h', mimeType: 'application/pdf', sizeBytes: 100 })
    await vault.share(OWNER, doc.id, { grantedTo: { kind: 'partner', id: 'partner_7' }, actions: ['view', 'download'] })
    const partner: AccessSubject = { actorId: 'u_p', role: 'partner', partnerId: 'partner_7' }
    await expect(
      vault.commitUpload(partner, { ownerAccountId: 'acc_1', metadata: doc.metadata, storageRef: 'r2', contentHash: 'h2', mimeType: 'application/pdf', sizeBytes: 120, replaceDocumentId: doc.id }),
    ).rejects.toBeInstanceOf(VaultAccessError)
    // No second version grafted on; the replace denial is audited as not-allowed against the partner.
    expect(store.docs.get(doc.id)!.versions).toHaveLength(1)
    expect(store.audits.some((a) => a.action === 'replace' && !a.allowed && a.actorId === 'u_p')).toBe(true)
  })
})
