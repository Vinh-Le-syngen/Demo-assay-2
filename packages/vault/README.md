# @sys/vault

Jurisdiction-aware document vault: versioned evidence + metadata + access decisions + audit + retention policy. Owns the **domain**; the host injects **storage (bytes)**, the **store (rows)**, and the **identity model** — "own the domain, rent the bytes." Reusable across apps; country rules are policy/config.

**Plane:** control (primary), governance, data, observability, recovery  ·  part of the `@sys/*` monorepo. Design: [`docs/sys-vault-design.md`](../../docs/sys-vault-design.md).

## Install

```json
"@sys/vault": "file:vendor/sys-vault-0.0.1.tgz"
```

## API

- `createVault({ store, storage, accessPolicy, idFactory, clock }): Vault` — orchestration (Control). Every flow computes an `AccessDecision` and writes an `AuditEvent`:
  - `requestUpload(subject, {ownerAccountId, category, mimeType})` → signed upload URL (write-gated).
  - `commitUpload(subject, input)` → new `VaultDocument` (v1) **or** a new **version** (replace, supersede), audited.
  - `download(subject, documentId)` → access-gated → short-lived signed URL, audited (incl. denials).
  - `share(subject, documentId, grant)` → explicit per-actor/partner/case grant, audited.
  - `reusableFor(accountId, requiredTypes)` → `{ reusable, missing }` (active + not-expired only).
  - `linkToCase(subject, serviceRequestId, documentId)` → a **reference** (no byte copy), audited.
- `createRoleScopeAccessPolicy(): AccessPolicy` — role+scope base (client-own / agent-assigned / admin-all / partner-scoped) + explicit `DocumentShare` grants (action-scoped, expiry-checked).
- `reusableFor` / `isReusable` — pure reuse logic.
- Domain (`@sys/vault/core`): `VaultDocument`, `DocumentVersion`, `DocumentMetadata`, `DocumentShare`, `AuditEvent`, `ServiceRequestDocumentLink`; the injected `VaultStore` / `ObjectStorage` seams; the `RetentionPolicy` / `ValidityCheck` / `AccessPolicy` policy seams.

## Doctrine

Reference-never-duplicate · append-only + permanent retention (replace = new version) · own-domain-rent-bytes (signed URLs; app never streams bytes) · metadata first-class + jurisdiction-aware · role+scope + explicit shares · everything audited · reuse is a feature.

## Extend via

A `VaultStore` + `ObjectStorage` adapter (host), and per-jurisdiction `RetentionPolicy` / `ValidityCheck` (config). Customer-profile layer (Person/Organization/Relationship) is Phase 2.
