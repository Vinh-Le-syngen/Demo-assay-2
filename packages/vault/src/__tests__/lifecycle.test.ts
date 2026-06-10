import { describe, it, expect, beforeEach } from 'vitest'
import { createVault, type Vault } from '../core/service'
import { createRoleScopeAccessPolicy } from '../core/access'
import type { AccessSubject, AuditEvent, DocumentShare, DocumentVersion, ObjectStorage, ServiceRequestDocumentLink, VaultDocument, VaultStore } from '../core/contract'

const NOW = '2026-06-03T00:00:00Z'

class FakeStore implements VaultStore {
  docs = new Map<string, VaultDocument>()
  shares: DocumentShare[] = []
  audits: AuditEvent[] = []
  links: ServiceRequestDocumentLink[] = []
  supersedeCalls: Array<{ documentId: string; supersede: boolean }> = []
  async getDocument(id: string) { return this.docs.get(id) ?? null }
  async insertDocument(doc: VaultDocument) { this.docs.set(doc.id, doc) }
  async addVersion(documentId: string, v: DocumentVersion, supersede: boolean) {
    this.supersedeCalls.push({ documentId, supersede })
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

describe('vault service — full document lifecycle (intra-system)', () => {
  it('upload → replace → replace: versions accumulate to v3, currentVersionId tracks the newest, and supersede is requested each replace', async () => {
    const doc = await commit(OWNER)
    const v2 = await vault.commitUpload(OWNER, { ownerAccountId: 'acc_1', metadata: doc.metadata, storageRef: 'r2', contentHash: 'h2', mimeType: 'application/pdf', sizeBytes: 120, replaceDocumentId: doc.id })
    const v3 = await vault.commitUpload(OWNER, { ownerAccountId: 'acc_1', metadata: doc.metadata, storageRef: 'r3', contentHash: 'h3', mimeType: 'application/pdf', sizeBytes: 130, replaceDocumentId: doc.id })

    const stored = store.docs.get(doc.id)!
    expect(stored.versions.map((v) => v.versionNo)).toEqual([1, 2, 3])
    expect(v3.versions).toHaveLength(3)
    expect(stored.currentVersionId).toBe(v3.versions.at(-1)!.id)
    // Each replace asks the store to supersede the previous version (retention: old versions kept, not deleted).
    expect(store.supersedeCalls).toEqual([
      { documentId: doc.id, supersede: true },
      { documentId: doc.id, supersede: true },
    ])
    // The original v1 remains present in the version history.
    expect(stored.versions[0]!.contentHash).toBe('h')
    expect(v2.versions.at(-1)!.versionNo).toBe(2)
  })

  it('share then grantee-download then link-to-case produces a complete, ordered audit trail', async () => {
    const doc = await commit(OWNER)
    const partner: AccessSubject = { actorId: 'u_p', role: 'partner', partnerId: 'partner_7' }

    await vault.share(OWNER, doc.id, { grantedTo: { kind: 'partner', id: 'partner_7' }, actions: ['view', 'download'] })
    const url = await vault.download(partner, doc.id)
    await vault.linkToCase(OWNER, 'sr_99', doc.id, 'passport')

    expect(url).toContain('https://down/')
    const actions = store.audits.map((a) => a.action)
    expect(actions).toEqual(['upload', 'share', 'download', 'link_to_case'])
    // The grantee download was recorded as allowed against the partner actor.
    expect(store.audits.find((a) => a.action === 'download')).toMatchObject({ allowed: true, actorId: 'u_p' })
    // The case link references the current version, marked reused, with no document copy.
    expect(store.links).toHaveLength(1)
    expect(store.links[0]).toMatchObject({ serviceRequestId: 'sr_99', documentId: doc.id, versionId: store.docs.get(doc.id)!.currentVersionId, reused: true })
  })

  it('replacing carries the share forward: a share granted before replace still authorises the grantee after a new version', async () => {
    const doc = await commit(OWNER)
    const partner: AccessSubject = { actorId: 'u_p', role: 'partner', partnerId: 'partner_7' }
    await vault.share(OWNER, doc.id, { grantedTo: { kind: 'partner', id: 'partner_7' }, actions: ['view', 'download'] })

    await vault.commitUpload(OWNER, { ownerAccountId: 'acc_1', metadata: doc.metadata, storageRef: 'r2', contentHash: 'h2', mimeType: 'application/pdf', sizeBytes: 120, replaceDocumentId: doc.id })

    // The grantee can still download — the share is on the document, not the version.
    const url = await vault.download(partner, doc.id)
    expect(url).toContain('https://down/')
    // And the URL is signed for the newest (replacement) version's storageRef.
    expect(url).toContain('r2')
  })
})
