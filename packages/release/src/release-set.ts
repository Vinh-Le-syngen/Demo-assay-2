// @sys/release — release-set creation + validation. Pure: both take an injected host.
// create snapshots current workspace versions into a provenance-bearing record; validate
// confirms a stored record still matches the workspace (the drift gate) + freshness.

import type { ReleaseHost } from './host'
import type { EvidenceRef, ReleaseFinding, ReleaseSet, ReleaseStatus } from './types'
import { discoverWorkspacePackages } from './workspace'

export interface CreateReleaseSetArgs {
  host: ReleaseHost
  name: string
  version: string
  /** lifecycle status (default 'draft'); a checked, shippable set is 'live'. */
  status?: ReleaseStatus
  /** include private packages too (default false — only publishable members) */
  includePrivate?: boolean
  contracts?: Record<string, number>
  /** why the set is trustworthy — canon-style provenance, e.g. { source: 'pnpm-check', ref: 'passed' }. */
  evidence?: EvidenceRef[]
  owner?: string
  approvedBy?: string
  createdAt?: string
  expiresAt?: string
  notes?: string
}

export function createReleaseSet(args: CreateReleaseSetArgs): ReleaseSet {
  const pkgs = discoverWorkspacePackages(args.host).filter(
    (p) => args.includePrivate || !p.private,
  )
  const packages: Record<string, string> = {}
  for (const p of pkgs) packages[p.name] = p.version

  const set: ReleaseSet = {
    schema_version: 1,
    name: args.name,
    version: args.version,
    status: args.status ?? 'draft',
    packages,
    evidence: args.evidence ?? [],
  }
  if (args.contracts) set.contracts = args.contracts
  if (args.owner) set.owner = args.owner
  if (args.approvedBy) set.approved_by = args.approvedBy
  if (args.createdAt) set.created_at = args.createdAt
  if (args.expiresAt) set.expires_at = args.expiresAt
  if (args.notes) set.notes = args.notes
  return set
}

export interface ValidateReleaseSetArgs {
  set: ReleaseSet
  host: ReleaseHost
  /** ISO instant for the freshness check; if omitted, expiry is not evaluated. */
  now?: string
}

/** Confirm a stored release set still agrees with the workspace it claims to describe. */
export function validateReleaseSet(args: ValidateReleaseSetArgs): ReleaseFinding[] {
  const { set, host } = args
  const findings: ReleaseFinding[] = []
  const ws = new Map(discoverWorkspacePackages(host).map((p) => [p.name, p]))

  for (const [name, version] of Object.entries(set.packages)) {
    const wp = ws.get(name)
    if (!wp) {
      findings.push({
        code: 'release_set_package_missing',
        severity: 'blocker',
        message: `release set lists "${name}" which is not in the workspace`,
        package: name,
      })
      continue
    }
    if (wp.version !== version) {
      findings.push({
        code: 'release_set_version_mismatch',
        severity: 'blocker',
        message: `release set pins ${name}@${version} but workspace is at ${wp.version}`,
        package: name,
      })
    }
  }

  for (const [name, v] of Object.entries(set.contracts ?? {})) {
    if (!Number.isInteger(v)) {
      findings.push({
        code: 'contract_version_invalid',
        severity: 'blocker',
        message: `contract "${name}" version must be an integer, got ${String(v)}`,
      })
    }
  }

  if ((set.status === 'live' || set.status === 'approved') && set.evidence.length === 0) {
    findings.push({
      code: 'evidence_not_recorded',
      severity: 'warning',
      message: `${set.status} release set ${set.name}@${set.version} records no evidence`,
    })
  }

  if (args.now && set.expires_at && set.expires_at < args.now && set.status !== 'superseded') {
    findings.push({
      code: 'release_set_stale',
      severity: 'warning',
      message: `release set ${set.name}@${set.version} expired at ${set.expires_at}`,
    })
  }

  return findings
}
