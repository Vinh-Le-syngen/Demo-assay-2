// @sys/vault core service. Orchestration only (Control): every flow computes an AccessDecision via
// the injected AccessPolicy and writes an AuditEvent. Storage/store/clock are injected — no IO here.

import type {
  AccessPolicy,
  AccessSubject,
  AuditAction,
  AuditEvent,
  DocAction,
  DocumentMetadata,
  DocumentVersion,
  ObjectStorage,
  ServiceRequestDocumentLink,
  VaultDocument,
  VaultStore,
} from './contract'
import { reusableFor, type ReuseResult } from './reuse'

export class VaultAccessError extends Error {
  constructor(public readonly reason: string) {
    super(`vault: access denied — ${reason}`)
    this.name = 'VaultAccessError'
  }
}

export interface VaultDeps {
  store: VaultStore
  storage: ObjectStorage
  accessPolicy: AccessPolicy
  idFactory: () => string
  clock: () => string // ISO now
}

export interface CommitUploadInput {
  ownerAccountId: string
  metadata: DocumentMetadata
  storageRef: string
  contentHash: string
  mimeType: string
  sizeBytes: number
  replaceDocumentId?: string // present → adds a new version + supersedes
}

export interface Vault {
  requestUpload(subject: AccessSubject, input: { ownerAccountId: string; category: string; mimeType: string }): Promise<{ url: string; storageRef: string }>
  commitUpload(subject: AccessSubject, input: CommitUploadInput): Promise<VaultDocument>
  download(subject: AccessSubject, documentId: string): Promise<string>
  share(subject: AccessSubject, documentId: string, grant: { grantedTo: { kind: 'actor' | 'partner' | 'case'; id: string }; actions: DocAction[]; expiresAt?: string }): Promise<void>
  reusableFor(accountId: string, requiredTypes: string[]): Promise<ReuseResult>
  linkToCase(subject: AccessSubject, serviceRequestId: string, documentId: string, requiredType?: string): Promise<ServiceRequestDocumentLink>
}

export function createVault(deps: VaultDeps): Vault {
  const { store, storage, accessPolicy, idFactory, clock } = deps

  const audit = (documentId: string, action: AuditAction, actorId: string, allowed: boolean, extra?: { versionId?: string; context?: Record<string, unknown> }) =>
    store.appendAudit({ id: idFactory(), documentId, action, actorId, at: clock(), allowed, versionId: extra?.versionId, context: extra?.context })

  // Creating/replacing for an account: owner, admin, or an assigned agent.
  const canWrite = (subject: AccessSubject, ownerAccountId: string): boolean =>
    subject.role === 'admin' ||
    (subject.role === 'client' && subject.accountId === ownerAccountId) ||
    (subject.role === 'agent' && (subject.assignedAccountIds ?? []).includes(ownerAccountId))

  // Decide on an existing doc, audit the denial, throw on deny.
  async function gate(subject: AccessSubject, doc: VaultDocument, action: DocAction): Promise<void> {
    const shares = await store.listShares(doc.id)
    const decision = accessPolicy.decide(subject, doc, action, shares, clock())
    if (!decision.allow) {
      await audit(doc.id, action as AuditAction, subject.actorId, false, { context: { reason: decision.reason } })
      throw new VaultAccessError(decision.reason)
    }
  }

  return {
    async requestUpload(subject, input) {
      if (!canWrite(subject, input.ownerAccountId)) throw new VaultAccessError(`role=${subject.role} cannot upload for account ${input.ownerAccountId}`)
      const key = `${input.ownerAccountId}/${input.category}/${idFactory()}`
      return storage.signUpload(key, input.mimeType)
    },

    async commitUpload(subject, input) {
      const now = clock()
      const version: DocumentVersion = {
        id: idFactory(),
        versionNo: 1,
        storageRef: input.storageRef,
        contentHash: input.contentHash,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        uploadedBy: subject.actorId,
        uploadedAt: now,
      }

      if (input.replaceDocumentId) {
        const existing = await store.getDocument(input.replaceDocumentId)
        if (!existing) throw new VaultAccessError(`unknown document ${input.replaceDocumentId}`)
        await gate(subject, existing, 'replace')
        // Snapshot BEFORE addVersion — don't rely on whether the store mutates `existing.versions`.
        const priorVersions = [...existing.versions]
        version.versionNo = (priorVersions.at(-1)?.versionNo ?? priorVersions.length) + 1
        await store.addVersion(existing.id, version, true)
        await audit(existing.id, 'replace', subject.actorId, true, { versionId: version.id })
        return { ...existing, currentVersionId: version.id, versions: [...priorVersions, version] }
      }

      if (!canWrite(subject, input.ownerAccountId)) throw new VaultAccessError(`role=${subject.role} cannot upload for account ${input.ownerAccountId}`)
      const doc: VaultDocument = {
        id: idFactory(),
        ownerAccountId: input.ownerAccountId,
        metadata: input.metadata,
        status: 'active',
        currentVersionId: version.id,
        versions: [version],
        source: 'uploaded',
        createdAt: now,
      }
      await store.insertDocument(doc)
      await audit(doc.id, 'upload', subject.actorId, true, { versionId: version.id })
      return doc
    },

    async download(subject, documentId) {
      const doc = await store.getDocument(documentId)
      if (!doc) throw new VaultAccessError(`unknown document ${documentId}`)
      await gate(subject, doc, 'download')
      const current = doc.versions.find((v) => v.id === doc.currentVersionId) ?? doc.versions.at(-1)!
      const url = await storage.signDownload(current.storageRef, 300)
      await audit(doc.id, 'download', subject.actorId, true, { versionId: current.id })
      return url
    },

    async share(subject, documentId, grant) {
      const doc = await store.getDocument(documentId)
      if (!doc) throw new VaultAccessError(`unknown document ${documentId}`)
      await gate(subject, doc, 'share')
      const share = { id: idFactory(), documentId, grantedBy: subject.actorId, ...grant }
      await store.insertShare(share)
      await audit(doc.id, 'share', subject.actorId, true, { context: { grantedTo: grant.grantedTo } })
    },

    async reusableFor(accountId, requiredTypes) {
      const docs = await store.listForAccount(accountId)
      return reusableFor(docs, requiredTypes, clock())
    },

    async linkToCase(subject, serviceRequestId, documentId, requiredType) {
      const doc = await store.getDocument(documentId)
      if (!doc) throw new VaultAccessError(`unknown document ${documentId}`)
      await gate(subject, doc, 'view')
      const link: ServiceRequestDocumentLink = { serviceRequestId, documentId, versionId: doc.currentVersionId, requiredType, reused: true }
      await store.insertLink(link)
      await audit(doc.id, 'link_to_case', subject.actorId, true, { context: { serviceRequestId } })
      return link
    },
  }
}
