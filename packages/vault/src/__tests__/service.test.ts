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
const STRANGER: AccessSubject = { actorId: 'u_x', role: 'client', accountId: 'acc_other' }

let store: FakeStore
let vault: Vault
beforeEach(() => {
  store = new FakeStore()
  let n = 0
  vault = createVault({ store, storage: new FakeStorage(), accessPolicy: createRoleScopeAccessPolicy(), idFactory: () => `id_${++n}`, clock: () => NOW })
})

const commit = (subject: AccessSubject, over = {}) =>
  vault.commitUpload(subject, { ownerAccountId: 'acc_1', metadata: { category: 'passport', holder: 'p1' }, storageRef: 'acc_1/passport/x', contentHash: 'h', mimeType: 'application/pdf', sizeBytes: 100, ...over })

describe('vault service', () => {
  it('owner uploads → creates an active doc v1 + audits the upload', async () => {
    const doc = await commit(OWNER)
    expect(doc.status).toBe('active')
    expect(doc.versions).toHaveLength(1)
    expect(store.audits.at(-1)).toMatchObject({ action: 'upload', allowed: true, actorId: 'u_owner' })
  })

  it('a non-owner cannot request an upload for the account', async () => {
    await expect(vault.requestUpload(STRANGER, { ownerAccountId: 'acc_1', category: 'passport', mimeType: 'application/pdf' })).rejects.toBeInstanceOf(VaultAccessError)
  })

  it('owner downloads → signed URL + a download audit; a stranger is denied AND the denial is audited', async () => {
    const doc = await commit(OWNER)
    const url = await vault.download(OWNER, doc.id)
    expect(url).toContain('https://down/')
    expect(store.audits.some((a) => a.action === 'download' && a.allowed)).toBe(true)

    await expect(vault.download(STRANGER, doc.id)).rejects.toBeInstanceOf(VaultAccessError)
    expect(store.audits.some((a) => a.action === 'download' && !a.allowed && a.actorId === 'u_x')).toBe(true)
  })

  it('replace adds a NEW version (v2) and bumps currentVersionId; old version retained', async () => {
    const doc = await commit(OWNER)
    const replaced = await vault.commitUpload(OWNER, { ownerAccountId: 'acc_1', metadata: doc.metadata, storageRef: 'acc_1/passport/y', contentHash: 'h2', mimeType: 'application/pdf', sizeBytes: 120, replaceDocumentId: doc.id })
    expect(replaced.versions).toHaveLength(2)
    expect(replaced.versions.at(-1)!.versionNo).toBe(2)
    expect(store.docs.get(doc.id)!.currentVersionId).toBe(replaced.versions.at(-1)!.id)
    expect(store.audits.some((a) => a.action === 'replace' && a.allowed)).toBe(true)
  })

  it('an explicit share lets the grantee download what they otherwise could not', async () => {
    const doc = await commit(OWNER)
    const partner: AccessSubject = { actorId: 'u_p', role: 'partner', partnerId: 'partner_7' }
    await expect(vault.download(partner, doc.id)).rejects.toBeInstanceOf(VaultAccessError) // before share
    await vault.share(OWNER, doc.id, { grantedTo: { kind: 'partner', id: 'partner_7' }, actions: ['view', 'download'] })
    const url = await vault.download(partner, doc.id) // after share
    expect(url).toContain('https://down/')
  })

  it('reusableFor reflects what the account already holds', async () => {
    await commit(OWNER) // a passport
    const r = await vault.reusableFor('acc_1', ['passport', 'emirates_id'])
    expect(r.reusable.map((d) => d.metadata.category)).toEqual(['passport'])
    expect(r.missing).toEqual(['emirates_id'])
  })

  it('linking a doc to a case records a reference + audit (no copy)', async () => {
    const doc = await commit(OWNER)
    const link = await vault.linkToCase(OWNER, 'sr_1', doc.id, 'passport')
    expect(link).toMatchObject({ serviceRequestId: 'sr_1', documentId: doc.id, reused: true })
    expect(store.links).toHaveLength(1)
    expect(store.audits.some((a) => a.action === 'link_to_case')).toBe(true)
  })
})
