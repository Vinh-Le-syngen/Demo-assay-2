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

describe('vault service — negative (resilience)', () => {
  // input-validation: operations referencing a non-existent document must fail loudly, not silently.
  it('downloading an unknown document throws VaultAccessError (input-validation)', async () => {
    await expect(vault.download(OWNER, 'does_not_exist')).rejects.toBeInstanceOf(VaultAccessError)
  })

  it('replacing an unknown document throws VaultAccessError naming the missing id', async () => {
    await expect(
      vault.commitUpload(OWNER, { ownerAccountId: 'acc_1', metadata: { category: 'passport', holder: 'p1' }, storageRef: 'r', contentHash: 'h', mimeType: 'application/pdf', sizeBytes: 1, replaceDocumentId: 'ghost' }),
    ).rejects.toThrow(/unknown document ghost/)
  })

  it('sharing an unknown document throws VaultAccessError', async () => {
    await expect(
      vault.share(OWNER, 'ghost', { grantedTo: { kind: 'partner', id: 'p' }, actions: ['view'] }),
    ).rejects.toBeInstanceOf(VaultAccessError)
  })

  it('linking an unknown document to a case throws VaultAccessError', async () => {
    await expect(vault.linkToCase(OWNER, 'sr_1', 'ghost', 'passport')).rejects.toBeInstanceOf(VaultAccessError)
  })

  // authz: a denied write/read must raise the real access error.
  it('requestUpload for an account the caller does not own is denied (authz)', async () => {
    await expect(
      vault.requestUpload(STRANGER, { ownerAccountId: 'acc_1', category: 'passport', mimeType: 'application/pdf' }),
    ).rejects.toBeInstanceOf(VaultAccessError)
  })

  it('a stranger cannot replace another account holder document (authz)', async () => {
    const doc = await commit(OWNER)
    await expect(
      vault.commitUpload(STRANGER, { ownerAccountId: 'acc_1', metadata: doc.metadata, storageRef: 'r2', contentHash: 'h2', mimeType: 'application/pdf', sizeBytes: 2, replaceDocumentId: doc.id }),
    ).rejects.toBeInstanceOf(VaultAccessError)
  })

  it('an assigned agent may not replace (write) — unsupported for that role', async () => {
    const agent: AccessSubject = { actorId: 'u_agent', role: 'agent', assignedAccountIds: ['acc_1'] }
    const doc = await commit(OWNER)
    await expect(
      vault.commitUpload(agent, { ownerAccountId: 'acc_1', metadata: doc.metadata, storageRef: 'r2', contentHash: 'h2', mimeType: 'application/pdf', sizeBytes: 2, replaceDocumentId: doc.id }),
    ).rejects.toBeInstanceOf(VaultAccessError)
  })

  // unsupported: there is NO delete API — retention is permanent. Assert the surface does not expose one.
  it('the vault exposes no delete/destroy operation (retention is permanent)', () => {
    const surface = vault as unknown as Record<string, unknown>
    for (const op of ['delete', 'destroy', 'remove', 'hardDelete']) {
      expect(surface[op]).toBeUndefined()
    }
  })
})
