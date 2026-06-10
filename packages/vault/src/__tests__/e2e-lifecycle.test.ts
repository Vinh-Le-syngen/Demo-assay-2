import { describe, it, expect, beforeEach } from 'vitest'
import { createVault, type Vault } from '../core/service'
import { createRoleScopeAccessPolicy } from '../core/access'
import type { AccessSubject, AuditEvent, DocumentShare, DocumentVersion, ObjectStorage, ServiceRequestDocumentLink, VaultDocument, VaultStore } from '../core/contract'

// End-to-end (happy path_kind): drive a full document lifecycle through the REAL service + real
// access policy, with only the injected store/storage seams faked. Distinct from lifecycle.test.ts
// (which isolates single transitions). This walks a SINGLE document from request → commit →
// reuse-check → replace → share → grantee-download → link-to-case in one ordered traversal,
// asserting end-state + the whole audit trail. The denied/recovery counterpart lives in
// e2e-recovery.test.ts so each path_kind is its own registered test FILE.

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

describe('vault — e2e document lifecycle (happy)', () => {
  // happy: the whole evidence lifecycle in one traversal, exercising every public method.
  it('happy: request → commit → reuse-check → replace → share → grantee-download → link-to-case', async () => {
    // 1. Owner asks for an upload slot.
    const slot = await vault.requestUpload(OWNER, { ownerAccountId: 'acc_1', category: 'passport', mimeType: 'application/pdf' })
    expect(slot.url).toContain('https://up/')

    // 2. Owner commits the uploaded object → an active v1 document.
    const doc = await vault.commitUpload(OWNER, { ownerAccountId: 'acc_1', metadata: { category: 'passport', holder: 'p1', expiryDate: '2030-01-01T00:00:00Z' }, storageRef: slot.storageRef, contentHash: 'h1', mimeType: 'application/pdf', sizeBytes: 100 })
    expect(doc.status).toBe('active')

    // 3. A later service checks reuse: the passport is now reusable; an unrelated type is missing.
    const reuse = await vault.reusableFor('acc_1', ['passport', 'emirates_id'])
    expect(reuse.reusable.map((d) => d.metadata.category)).toEqual(['passport'])
    expect(reuse.missing).toEqual(['emirates_id'])

    // 4. Owner replaces it (renewed passport) → v2; v1 retained, current pointer advances.
    const replaced = await vault.commitUpload(OWNER, { ownerAccountId: 'acc_1', metadata: doc.metadata, storageRef: 'acc_1/passport/v2', contentHash: 'h2', mimeType: 'application/pdf', sizeBytes: 120, replaceDocumentId: doc.id })
    expect(replaced.versions.map((v) => v.versionNo)).toEqual([1, 2])
    expect(store.docs.get(doc.id)!.currentVersionId).toBe(replaced.versions.at(-1)!.id)

    // 5. Owner shares view+download with a partner.
    const partner: AccessSubject = { actorId: 'u_p', role: 'partner', partnerId: 'partner_7' }
    await vault.share(OWNER, doc.id, { grantedTo: { kind: 'partner', id: 'partner_7' }, actions: ['view', 'download'] })

    // 6. The partner downloads — and gets the NEWEST version's signed URL.
    const url = await vault.download(partner, doc.id)
    expect(url).toContain('acc_1/passport/v2')

    // 7. Owner links the document into a service request as reused evidence.
    const link = await vault.linkToCase(OWNER, 'sr_42', doc.id, 'passport')
    expect(link).toMatchObject({ serviceRequestId: 'sr_42', documentId: doc.id, versionId: store.docs.get(doc.id)!.currentVersionId, reused: true })

    // End-state: one document, two versions, one share, one link, and a complete ordered audit trail.
    expect(store.docs.size).toBe(1)
    expect(store.shares).toHaveLength(1)
    expect(store.links).toHaveLength(1)
    expect(store.audits.map((a) => a.action)).toEqual(['upload', 'replace', 'share', 'download', 'link_to_case'])
    expect(store.audits.every((a) => a.allowed)).toBe(true)
  })
})
