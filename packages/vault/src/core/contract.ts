// @sys/vault — domain contract. Types only. The document side (v1); the customer-profile layer
// (Person/Organization/Relationship) is Phase 2. See docs/sys-vault-design.md.

export type PartyId = string
export type ActorId = string

export interface PostalAddress { line1: string; line2?: string; city: string; region?: string; postalCode?: string; country: string }

// ── Document + versions ────────────────────────────────────────────────────────────
export type DocumentStatus = 'active' | 'expired' | 'superseded' | 'rejected'
export type DocumentSource = 'uploaded' | 'generated'

export interface DocumentMetadata {
  category: string // 'passport' | 'trade_licence' | 'invoice' | … (jurisdiction-extensible)
  holder: PartyId
  jurisdiction?: string
  issuer?: string
  issueDate?: string
  expiryDate?: string
  documentNumber?: string
}
export interface DocumentVersion {
  id: string
  versionNo: number
  storageRef: string
  contentHash: string
  mimeType: string
  sizeBytes: number
  uploadedBy: ActorId
  uploadedAt: string
  extracted?: Record<string, unknown>
}
export interface VaultDocument {
  id: string
  ownerAccountId: string
  metadata: DocumentMetadata
  status: DocumentStatus
  currentVersionId: string
  versions: DocumentVersion[]
  source: DocumentSource
  producerRef?: { system: string; id: string }
  createdAt: string
}

// ── Access ──────────────────────────────────────────────────────────────────────
export type Role = 'client' | 'agent' | 'admin' | 'partner'
export type DocAction = 'view' | 'download' | 'replace' | 'share'
export interface AccessSubject {
  actorId: ActorId
  role: Role
  accountId?: string // the account this actor belongs to (client)
  partnerId?: string
  assignedAccountIds?: string[] // accounts an agent is assigned to
}
export interface DocumentShare {
  id: string
  documentId: string
  grantedTo: { kind: 'actor' | 'partner' | 'case'; id: string }
  actions: DocAction[]
  expiresAt?: string
  grantedBy: ActorId
}
export interface AccessDecision { allow: boolean; reason: string }

export interface AccessPolicy {
  decide(subject: AccessSubject, doc: VaultDocument, action: DocAction, shares: DocumentShare[], now: string): AccessDecision
}

// ── Audit ──────────────────────────────────────────────────────────────────────
export type AuditAction = 'upload' | 'replace' | 'view' | 'download' | 'share' | 'unshare' | 'status_change' | 'retention_action' | 'link_to_case'
export interface AuditEvent {
  id: string
  documentId: string
  versionId?: string
  action: AuditAction
  actorId: ActorId
  at: string
  allowed: boolean
  context?: Record<string, unknown>
}

// ── Case linkage (reference, not ownership) ──────────────────────────────────────
export interface ServiceRequestDocumentLink {
  serviceRequestId: string
  documentId: string
  versionId: string
  requiredType?: string
  reused: boolean
}

// ── Policy seams (Governance — injected per jurisdiction) ────────────────────────
export interface RetentionPolicy {
  jurisdiction: string
  retainYears(category: string): number
  mayHardDelete(doc: VaultDocument, now: string, legalHold: boolean): AccessDecision
  mustStayInJurisdiction?(category: string): boolean
}
export interface ValidityCheck {
  check(doc: VaultDocument, now: string): { ok: boolean; reason?: string }
}

// ── Injected seams (Data — host implements) ──────────────────────────────────────
export interface VaultStore {
  getDocument(id: string): Promise<VaultDocument | null>
  insertDocument(doc: VaultDocument): Promise<void>
  addVersion(documentId: string, v: DocumentVersion, supersedePrevious: boolean): Promise<void>
  setStatus(documentId: string, status: DocumentStatus): Promise<void>
  listForAccount(accountId: string): Promise<VaultDocument[]>
  listShares(documentId: string): Promise<DocumentShare[]>
  insertShare(share: DocumentShare): Promise<void>
  insertLink(link: ServiceRequestDocumentLink): Promise<void>
  appendAudit(e: AuditEvent): Promise<void>
}
export interface ObjectStorage {
  signUpload(key: string, mimeType: string): Promise<{ url: string; storageRef: string }>
  signDownload(storageRef: string, ttlSeconds: number): Promise<string>
}
