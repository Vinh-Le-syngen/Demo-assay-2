import { describe, it, expect, beforeEach } from 'vitest'
import { createVault, VaultAccessError, type Vault } from '../core/service'
import { createRoleScopeAccessPolicy } from '../core/access'
import type { AccessSubject, AuditEvent, DocumentShare, DocumentVersion, ObjectStorage, ServiceRequestDocumentLink, VaultDocument, VaultStore } from '../core/contract'

// End-to-end (recovery path_kind): an unauthorized actor is blocked mid-lifecycle (denial recorded),
// then the legitimate owner recovers and completes the flow — both outcomes coexist in the audit
// trail, nothing lost or rewritten. The happy full-lifecycle counterpart lives in
// e2e-lifecycle.test.ts so each path_kind is its own registered test FILE.

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

describe('vault — e2e document lifecycle (recovery)', () => {
  // recovery: an unauthorized actor is blocked mid-lifecycle (denial recorded), then the
  // legitimate owner recovers and completes the flow — both outcomes coexist in the trail.
  it('recovery: a denied access is audited, then the owner recovers and completes download + link-to-case', async () => {
    const doc = await vault.commitUpload(OWNER, { ownerAccountId: 'acc_1', metadata: { category: 'passport', holder: 'p1' }, storageRef: 'acc_1/passport/x', contentHash: 'h1', mimeType: 'application/pdf', sizeBytes: 100 })

    // A rogue (unassigned) agent attempts to download → denied + denial audited.
    const rogue: AccessSubject = { actorId: 'u_rogue', role: 'agent', assignedAccountIds: ['acc_other'] }
    await expect(vault.download(rogue, doc.id)).rejects.toBeInstanceOf(VaultAccessError)

    // The legitimate owner recovers: download succeeds, then links into a case.
    const url = await vault.download(OWNER, doc.id)
    expect(url).toContain('https://down/')
    const link = await vault.linkToCase(OWNER, 'sr_recover', doc.id, 'passport')
    expect(store.links).toContainEqual(expect.objectContaining({ serviceRequestId: 'sr_recover', reused: true }))

    // The trail holds BOTH the denial (rogue) and the recovery (owner) — nothing lost or rewritten.
    const denied = store.audits.find((a) => a.action === 'download' && !a.allowed)
    expect(denied).toMatchObject({ actorId: 'u_rogue', allowed: false })
    expect(store.audits.some((a) => a.action === 'download' && a.allowed && a.actorId === 'u_owner')).toBe(true)
    expect(store.audits.some((a) => a.action === 'link_to_case' && a.allowed && a.actorId === 'u_owner')).toBe(true)
    expect(link.reused).toBe(true)
  })
})
