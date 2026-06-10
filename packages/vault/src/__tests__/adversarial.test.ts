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
let clockNow: string
beforeEach(() => {
  store = new FakeStore()
  clockNow = NOW
  let n = 0
  vault = createVault({ store, storage: new FakeStorage(), accessPolicy: createRoleScopeAccessPolicy(), idFactory: () => `id_${++n}`, clock: () => clockNow })
})

const commit = (subject: AccessSubject, over = {}) =>
  vault.commitUpload(subject, { ownerAccountId: 'acc_1', metadata: { category: 'passport', holder: 'p1' }, storageRef: 'acc_1/passport/x', contentHash: 'h', mimeType: 'application/pdf', sizeBytes: 100, ...over })

describe('vault service — adversarial (access-bypass attempts, protocol-misuse)', () => {
  it('cross-account: a client on another account cannot download another holder document, and the denial is audited', async () => {
    const doc = await commit(OWNER)
    const attacker: AccessSubject = { actorId: 'u_evil', role: 'client', accountId: 'acc_evil' }
    await expect(vault.download(attacker, doc.id)).rejects.toBeInstanceOf(VaultAccessError)
    expect(store.audits.some((a) => a.action === 'download' && !a.allowed && a.actorId === 'u_evil')).toBe(true)
  })

  it('expired share misuse: a grant that lapsed before now no longer authorises download', async () => {
    const doc = await commit(OWNER)
    const partner: AccessSubject = { actorId: 'u_p', role: 'partner', partnerId: 'partner_7' }
    // Grant a share that is already expired relative to the clock.
    await vault.share(OWNER, doc.id, { grantedTo: { kind: 'partner', id: 'partner_7' }, actions: ['view', 'download'], expiresAt: '2026-06-02T00:00:00Z' })
    await expect(vault.download(partner, doc.id)).rejects.toBeInstanceOf(VaultAccessError)
  })

  it('revoked-in-time share: a share valid earlier is denied once the clock advances past expiry', async () => {
    const doc = await commit(OWNER)
    const partner: AccessSubject = { actorId: 'u_p', role: 'partner', partnerId: 'partner_7' }
    await vault.share(OWNER, doc.id, { grantedTo: { kind: 'partner', id: 'partner_7' }, actions: ['download'], expiresAt: '2026-06-04T00:00:00Z' })
    // While valid, download works.
    await expect(vault.download(partner, doc.id)).resolves.toContain('https://down/')
    // Advance the clock past expiry: the same share must now be rejected.
    clockNow = '2026-06-05T00:00:00Z'
    await expect(vault.download(partner, doc.id)).rejects.toBeInstanceOf(VaultAccessError)
  })

  it('scope-creep: a partner share for actions=[view] does NOT permit download (action escalation blocked)', async () => {
    const doc = await commit(OWNER)
    const partner: AccessSubject = { actorId: 'u_p', role: 'partner', partnerId: 'partner_7' }
    await vault.share(OWNER, doc.id, { grantedTo: { kind: 'partner', id: 'partner_7' }, actions: ['view'] })
    await expect(vault.download(partner, doc.id)).rejects.toBeInstanceOf(VaultAccessError)
  })

  it('unassigned-agent escalation: an agent NOT assigned to the account cannot read the document', async () => {
    const doc = await commit(OWNER)
    const rogueAgent: AccessSubject = { actorId: 'u_rogue', role: 'agent', assignedAccountIds: ['acc_other'] }
    await expect(vault.download(rogueAgent, doc.id)).rejects.toBeInstanceOf(VaultAccessError)
  })

  it('protocol-misuse: a partner cannot re-share a document granted to them (share is not transitive)', async () => {
    const doc = await commit(OWNER)
    const partner: AccessSubject = { actorId: 'u_p', role: 'partner', partnerId: 'partner_7' }
    // Owner grants the partner view+download — but NOT share.
    await vault.share(OWNER, doc.id, { grantedTo: { kind: 'partner', id: 'partner_7' }, actions: ['view', 'download'] })
    // The partner attempts to re-grant the document to a third party.
    await expect(
      vault.share(partner, doc.id, { grantedTo: { kind: 'actor', id: 'u_third' }, actions: ['view'] }),
    ).rejects.toBeInstanceOf(VaultAccessError)
    // No second share was persisted.
    expect(store.shares).toHaveLength(1)
  })

  it("protocol-misuse: a 'case'-kind grant does not authorise direct actor access (case grants resolve at link time only)", async () => {
    const doc = await commit(OWNER)
    await vault.share(OWNER, doc.id, { grantedTo: { kind: 'case', id: 'sr_1' }, actions: ['view', 'download'] })
    const partner: AccessSubject = { actorId: 'u_p', role: 'partner', partnerId: 'sr_1' }
    await expect(vault.download(partner, doc.id)).rejects.toBeInstanceOf(VaultAccessError)
  })
})
