// @sys/release — pure types. The attestor's vocabulary: a release set (a coherent,
// immutable, PROVENANCE-BEARING record of package + contract versions) and an adoption
// record (a product's declared use of that bundle). No IO, no Changesets logic.
//
// Provenance + decision shapes are MIRRORED from @sys/canon / @eng/governance (not imported):
// release is a separate domain from business canon — shared contract shape, separate brains.
// See docs/design/release-governance-boundary.md. The field names match deliberately so a
// future domain-free contract extraction is mechanical.

export type SchemaVersion = 1

/** GovernanceReason severity vocabulary (info | warning | blocker). */
export type Severity = 'info' | 'warning' | 'blocker'

/** A single attestation result — a GovernanceReason superset (adds package/path context). */
export interface ReleaseFinding {
  code: string
  severity: Severity
  message: string
  /** ids/paths this finding derives from (canon `derives_from`). */
  derivesFrom?: string[]
  package?: string
  path?: string
}

/** Evidence reference — canon's `{ source, ref }`. A release set's checks ARE its evidence. */
export interface EvidenceRef {
  source: string
  ref: string
}

/**
 * Lifecycle for a governed record — the canon RowStatus subset that is meaningful for a
 * release (canon also has provisional/verify, which a release does not use).
 */
export type ReleaseStatus = 'draft' | 'approved' | 'live' | 'superseded'

/**
 * A compatible bundle of package + contract versions, calendar-versioned (YYYY.MM.N).
 * Immutable once `live`. Produced from the workspace AFTER Changesets has set the versions;
 * this records (with provenance), it does not compute.
 */
export interface ReleaseSet {
  schema_version: SchemaVersion
  name: string
  version: string
  status: ReleaseStatus
  packages: Record<string, string>
  contracts?: Record<string, number>
  /** why this set is trustworthy — e.g. { source: 'pnpm-check', ref: 'passed' }. */
  evidence: EvidenceRef[]
  owner?: string
  approved_by?: string
  created_at?: string
  last_reviewed?: string
  /** ISO date; a set past this is flagged stale by the freshness check. */
  expires_at?: string
  /** the release-set version that replaces this one, once superseded. */
  superseded_by?: string
  notes?: string
}

export type AdoptionMode = 'warn' | 'strict' | 'off'

/** A product's `sys.lock.json` — what it claims to consume from /sys. */
export interface AdoptionRecord {
  schema_version: SchemaVersion
  product: string
  adopts?: { release_set?: string }
  packages: Record<string, string>
  contracts?: Record<string, number>
  modes?: Record<string, AdoptionMode>
}

export interface WorkspacePackage {
  name: string
  version: string
  /** directory relative to workspace root, e.g. "packages/canon" */
  path: string
  private: boolean
}

/* ── Decision contract (mirrors @eng/governance GovernanceDecision, release-domain subject) ── */

export type DecisionKind = 'allow' | 'deny' | 'warn'

export interface ReleaseSubject {
  type: 'release_set' | 'adoption'
  id: string
}

export interface ReleaseDecision {
  decision: DecisionKind
  subject: ReleaseSubject
  reasons: ReleaseFinding[]
  evidence?: EvidenceRef[]
  decidedAt: string
  policyVersion: string
}
