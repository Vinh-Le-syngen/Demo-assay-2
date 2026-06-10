# @sys/vault — design (v1)

> Jurisdiction-aware service-ops **document vault** + the customer-data layer it serves. Reusable
> `@sys/*` package: owns the domain model, metadata, versioning, access decisions, audit, and
> retention *policy*; the host injects storage (bytes), the store (rows), and the identity model.
> "Own the domain, rent the bytes." UAE-first; SG/ES/VN by policy/config, no core change.
>
> **Status:** v1 design. Decisions locked (2026-06-03): `@sys/vault` package · Supabase Storage with
> signed URLs now (R2/KMS later) · role+scope base + explicit per-document/case shares · build the
> **document side first**, customer-profile layer second.

## Three domains (separation of concerns)

The product promise — *"do the paperwork once, reuse the context across services and countries"* —
needs three distinct domains, not one document blob:

1. **Customer Profile** — reusable structured data. `Person`, `Organization`, `Relationship`
   (person↔company, spouse/family, authorized rep, advisor, partner). The *who*.
2. **Document Vault** — versioned evidence + metadata + access + audit + retention. Passports, IDs,
   trade licences, MoAs, visas, bank letters, **and generated docs (invoices, licences)** surfaced
   here. The *what*.
3. **Service Requests / Cases** — working files that **reference** profile data + vault documents.
   A case **links** to a document; it never **owns** or copies it. The *why/now*.

**Generated documents are surfaced, not owned, by the vault.** An invoice's system-of-record stays
`commercial_document` (`@sys/billing`); the vault shows a *link/projection* so the customer has one
home for everything. Same for licences the workflow issues.

## Doctrine

1. **Reference, never duplicate.** A service request links to a vault document + a specific
   **version**; it does not re-upload or copy bytes. One document, many cases.
2. **Append-only + permanent retention by default.** Documents are never hard-deleted by users
   (F-DOC-1 trigger). "Replace" creates a **new version**; the old version is retained.
   Hard-delete only under an explicit **RetentionPolicy** decision (legal expiry, no legal hold).
3. **The vault owns the domain; the host rents the bytes.** Bytes live in object storage (Supabase
   Storage now), accessed via **short-lived signed upload/download URLs** — the app servers never
   stream raw bytes. The package never imports storage or app code; storage is an injected seam.
4. **Metadata is first-class + jurisdiction-aware.** Type, holder (person/org), jurisdiction,
   issuer, issue/expiry dates, document number, status. Country-specific rules (required docs,
   retention windows, "must not leave jurisdiction X") are **policy/config**, never baked in.
5. **Access = role+scope base + explicit shares.** RLS role+scope (client/agent/admin/partner) is
   the default; an explicit `DocumentShare` grants per-document or per-case access (e.g. share a
   bank letter into one case for one partner). Every access is an **AccessDecision** the package
   computes; the host enforces it at the data layer.
6. **Everything is audited.** Upload, replace (new version), view, download (signed-URL mint),
   share, retention action — each is an immutable `AuditEvent`, queryable for compliance.
7. **Reuse is a feature, not a side effect.** Starting a new service shows which required documents
   are **already in the vault (reusable)** vs **missing/extra** — the existing reuse engine, made
   first-class.

## Domain model (TypeScript — shared, framework-agnostic)

```ts
// ── Identity (host-owned ids; the vault references them) ──────────────────────────
type PartyId = string            // a Person or Organization id (host identity model)
type ActorId = string            // who acted (auth user id)

// ── Customer profile layer (domain types; persistence is host) ───────────────────
interface Person { id: PartyId; kind: 'person'; fullName: string; nationality?: string; dob?: string; contact?: Contact }
interface Organization { id: PartyId; kind: 'organization'; legalName: string; jurisdiction: string; registrationNumber?: string; taxIds?: TaxId[] }
type Party = Person | Organization
interface Contact { email?: string; phone?: string; addresses?: PostalAddress[] }
interface TaxId { kind: string; number: string; country: string }
interface PostalAddress { line1: string; line2?: string; city: string; region?: string; postalCode?: string; country: string }

type RelationshipKind = 'director_of' | 'shareholder_of' | 'authorized_rep_of' | 'spouse_of' | 'advisor_of' | 'partner_of'
interface Relationship { id: string; from: PartyId; to: PartyId; kind: RelationshipKind; sharePct?: number }

// ── The document + its versions ──────────────────────────────────────────────────
type DocumentStatus = 'active' | 'expired' | 'superseded' | 'rejected'
interface DocumentMetadata {
  category: string               // 'passport' | 'trade_licence' | 'invoice' | … (jurisdiction-extensible)
  holder: PartyId                // whose document (person or org)
  jurisdiction?: string          // ISO country the doc pertains to
  issuer?: string
  issueDate?: string
  expiryDate?: string
  documentNumber?: string
}
interface DocumentVersion {
  id: string
  versionNo: number              // 1,2,3 — replace bumps this
  storageRef: string             // object-storage key (host streams via signed URL)
  contentHash: string            // tamper-evidence
  mimeType: string
  sizeBytes: number
  uploadedBy: ActorId
  uploadedAt: string
  extracted?: Record<string, unknown>   // AI/OCR later
}
interface VaultDocument {
  id: string
  ownerAccountId: string         // the customer account
  metadata: DocumentMetadata
  status: DocumentStatus
  currentVersionId: string
  versions: DocumentVersion[]    // append-only; never removed on replace
  source: 'uploaded' | 'generated'   // generated = invoice/licence surfaced from a producer
  producerRef?: { system: string; id: string }   // e.g. { system:'billing', id: commercial_document.id }
  createdAt: string
}

// ── Access (role+scope base + explicit shares) ───────────────────────────────────
type Role = 'client' | 'agent' | 'admin' | 'partner'
interface AccessSubject { actorId: ActorId; role: Role; accountId?: string; partnerId?: string; assignedAccountIds?: string[] }
type DocAction = 'view' | 'download' | 'replace' | 'share'
interface DocumentShare {
  id: string
  documentId: string
  grantedTo: { kind: 'actor' | 'partner' | 'case'; id: string }
  actions: DocAction[]
  expiresAt?: string
  grantedBy: ActorId
}
interface AccessDecision { allow: boolean; reason: string }

// ── Audit ────────────────────────────────────────────────────────────────────────
type AuditAction = 'upload' | 'replace' | 'view' | 'download' | 'share' | 'unshare' | 'status_change' | 'retention_action' | 'link_to_case'
interface AuditEvent {
  id: string
  documentId: string
  versionId?: string
  action: AuditAction
  actorId: ActorId
  at: string
  context?: Record<string, unknown>   // caseId, shareId, ip, etc.
}

// ── Case linkage (reference, not ownership) ──────────────────────────────────────
interface ServiceRequestDocumentLink { serviceRequestId: string; documentId: string; versionId: string; requiredType?: string; reused: boolean }

// ── Policy seams (Governance — injected per jurisdiction) ────────────────────────
interface RetentionPolicy {
  jurisdiction: string
  retainYears(category: string): number          // per-country retention window
  mayHardDelete(doc: VaultDocument, now: string, legalHold: boolean): AccessDecision
  mustStayInJurisdiction?(category: string): boolean
}
interface ValidityCheck { check(doc: VaultDocument, now: string): { ok: boolean; reason?: string } }   // e.g. passport ≥ 6 months
interface AccessPolicy {
  decide(subject: AccessSubject, doc: VaultDocument, action: DocAction, shares: DocumentShare[]): AccessDecision
}

// ── Injected seams (Data — host implements) ──────────────────────────────────────
interface VaultStore {
  getDocument(id: string): Promise<VaultDocument | null>
  insertDocument(doc: VaultDocument): Promise<void>
  addVersion(documentId: string, v: DocumentVersion): Promise<void>
  setStatus(documentId: string, status: DocumentStatus): Promise<void>
  listForHolder(holder: PartyId): Promise<VaultDocument[]>
  listShares(documentId: string): Promise<DocumentShare[]>
  appendAudit(e: AuditEvent): Promise<void>
}
interface ObjectStorage {
  signUpload(key: string, mimeType: string): Promise<{ url: string; storageRef: string }>
  signDownload(storageRef: string, ttlSeconds: number): Promise<string>
}
```

## The core service (Control) — what `@sys/vault` orchestrates

`createVault({ store, storage, accessPolicy, retention, validity?, audit?, idFactory })` →
- `requestUpload(subject, meta, mimeType)` → AccessDecision + a signed upload URL (audited).
- `commitUpload(subject, documentId|new, storageRef, hash, size)` → new `VaultDocument` or a new
  **version** (replace), status `active`, supersede prior, audit.
- `download(subject, documentId)` → AccessDecision → short-lived signed URL, audit `download`.
- `share(subject, documentId, grant)` / `revoke(...)` → enforce + audit.
- `reusableFor(accountId, requiredTypes[])` → `{ reusable: VaultDocument[]; missing: string[] }`.
- `linkToCase(subject, serviceRequestId, documentId)` → `ServiceRequestDocumentLink` (reference).
- `runRetention(now, legalHolds)` → per-`RetentionPolicy` actions (Recovery; never user-initiated).

Every method computes an `AccessDecision` via the injected `AccessPolicy` and writes an `AuditEvent`.
No IO/crypto in the package — storage + store + identity are injected, exactly like auth/pay/billing.

## How Qarar consumes it (host)

- **Store** over the existing `documents` table, evolved: add `document_version`, richer
  `document_metadata` columns, `document_share`, `document_audit_event`, `service_request_document`.
  Keep the F-DOC-1 no-delete trigger; replace → new version row.
- **Storage** = Supabase Storage; `signUpload`/`signDownload` via Supabase signed URLs (the app
  never streams bytes). R2/KMS is a later swap behind the same `ObjectStorage` seam.
- **AccessPolicy** = role+scope (client own / agent-assigned / admin all / partner-scoped) + the
  `document_share` grants.
- **RetentionPolicy** = per-country windows (config); UAE first. `@sys/warp` checks validate the
  graph (every category has a retention window; every enabled country has a policy).
- **Generated-doc surfacing**: a small adapter projects `commercial_document` (invoices) + issued
  licences into the vault list as `source:'generated'` with a `producerRef` (no byte copy; the
  invoice PDF is fetched from its producer on download).

## v1 cut-line
**Build now (document side):** versioning, rich metadata, signed upload/download, role+scope +
shares, audit log, per-country retention policy, reuse surface, generated-doc projection.
**Defer:** Org/Relationship profile layer (Phase 2), AI extraction/classification, R2/KMS,
cross-jurisdiction "must not leave" enforcement (model the flag now, enforce later).

## Phased plan
1. `@sys/vault` package — domain + core service + policy seams + **mutation-verified tests** + gates.
2. Qarar schema evolution (versions, metadata, shares, audit, case-links) + the `VaultStore`/
   `ObjectStorage` adapters + the vault API (upload/commit/download/share/reuse) + audit.
3. Surface invoices/generated docs in the vault GUI; wire the reuse surface into "start a service".
4. `@sys/warp` checks for the vault config graph (retention windows, required-doc maps per country).
5. Customer-profile layer (Person/Org/Relationship) — Phase 2.
