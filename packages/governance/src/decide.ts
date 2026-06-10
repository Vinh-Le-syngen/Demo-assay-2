// @eng/governance — the deciders (Control plane). Pure functions that compute decisions from @sys/canon
// RECORDS + injected policy. The engine owns no canonical truth; it reads records and decides.

import {
  DEFAULT_CLAIM_EXCLUDE,
  type RestrictedClaim,
  type ApprovedClaim,
  type Capability,
  type CapabilityStatus,
  type ServiceAuthorityEntry,
  type Severity,
} from '@sys/canon'

/* ───────────────────────── Restricted-claims scan ───────────────────────── */

export type ContentFile = { path: string; text: string }
export type ClaimViolation = { phrase: string; severity: Severity; path: string; line: number; excerpt: string }
export type ScanOptions = { exclude?: RegExp; caseInsensitive?: boolean }

export function scanClaims(files: ContentFile[], restricted: RestrictedClaim[], opts: ScanOptions = {}): ClaimViolation[] {
  const { exclude = DEFAULT_CLAIM_EXCLUDE, caseInsensitive = true } = opts
  const out: ClaimViolation[] = []
  for (const file of files) {
    if (exclude && exclude.test(file.path)) continue
    const lines = file.text.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i] ?? ''
      const hay = caseInsensitive ? lineText.toLowerCase() : lineText
      for (const r of restricted) {
        const needle = caseInsensitive ? r.phrase.toLowerCase() : r.phrase
        if (needle.length > 0 && hay.includes(needle)) {
          out.push({ phrase: r.phrase, severity: r.severity, path: file.path, line: i + 1, excerpt: lineText.trim().slice(0, 200) })
        }
      }
    }
  }
  return out
}

/* ───────────────────────── Claim → capability linker (positive permission) ───────────────────────── */

export type ClaimLinkIssue = {
  claim_id: string
  kind: 'missing_capability' | 'capability_not_live'
  capability: string
  severity: Severity
}

export function linkClaims(claims: ApprovedClaim[], capabilities: Capability[], opts: { allow?: CapabilityStatus[] } = {}): ClaimLinkIssue[] {
  const allow = opts.allow ?? (['live', 'assisted'] as CapabilityStatus[])
  const byId = new Map(capabilities.map((c) => [c.id, c]))
  const issues: ClaimLinkIssue[] = []
  for (const claim of claims) {
    for (const capId of claim.requires_capabilities) {
      const cap = byId.get(capId)
      if (!cap) issues.push({ claim_id: claim.id, kind: 'missing_capability', capability: capId, severity: 'high' })
      else if (!allow.includes(cap.capability_status)) issues.push({ claim_id: claim.id, kind: 'capability_not_live', capability: capId, severity: 'high' })
    }
  }
  return issues
}

/* ───────────────────────── Service authority decisions ───────────────────────── */

const READY = (r?: string) => r === 'ready'

/** Sellable = permitted (may_sell, no VERIFY) AND operationally deliverable (key readiness ready). */
export function commerciallySellable(entry: ServiceAuthorityEntry): boolean {
  if (entry.may_sell !== true) return false
  if (entry.requires_partner === 'VERIFY') return false
  const dr = entry.delivery_readiness
  if (!dr) return false
  return READY(dr.legal_authority) && READY(dr.operating_playbook) && READY(dr.document_requirements) && dr.failure_modes !== 'missing'
}

export function unresolvedServiceAuthority(services: Record<string, ServiceAuthorityEntry>): string[] {
  return Object.entries(services)
    .filter(([, v]) => v.may_sell === 'VERIFY' || v.requires_partner === 'VERIFY')
    .map(([k]) => k)
}
