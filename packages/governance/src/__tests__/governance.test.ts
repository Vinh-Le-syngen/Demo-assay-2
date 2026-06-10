import { describe, it, expect } from 'vitest'
import type { ApprovedClaim, Capability, ServiceAuthorityEntry, PageEntry } from '@sys/canon'
import { SeoRulesConfig } from '@sys/canon'
import { scanClaims, linkClaims, commerciallySellable, type ContentFile } from '../decide'
import { defineGovernance } from '../define'
import { pageAuthorityGate, cannibalizationGate, noindexGate, freshnessGate, seoRulesGate } from '../seo-gates'

const restricted = [
  { phrase: 'guaranteed approval', severity: 'critical' as const, replacement: 'guided support' },
  { phrase: 'legal advice', severity: 'high' as const },
]

describe('claim scan', () => {
  it('flags a restricted phrase; excludes legal pages by default', () => {
    const files: ContentFile[] = [
      { path: 'web/home.html', text: 'guaranteed approval' },
      { path: 'app/terms/page.tsx', text: 'does not provide legal advice' },
    ]
    const v = scanClaims(files, restricted)
    expect(v).toHaveLength(1)
    expect(v[0]!.path).toBe('web/home.html')
  })
})

describe('claim → capability', () => {
  const claims: ApprovedClaim[] = [
    { id: 'c1', text: 'guided formation', allowed_surfaces: [], requires_capabilities: ['cap.f'], prohibited_variants: [], status: 'approved', derives_from: [], evidence: [] },
    { id: 'c2', text: 'autopilot', allowed_surfaces: [], requires_capabilities: ['cap.auto'], prohibited_variants: [], status: 'approved', derives_from: [], evidence: [] },
  ]
  const caps: Capability[] = [
    { id: 'cap.f', capability_status: 'live', status: 'live', derives_from: [], evidence: [] },
    { id: 'cap.auto', capability_status: 'near_term', status: 'draft', derives_from: [], evidence: [] },
  ]
  it('passes live-backed, flags not-live and missing', () => {
    expect(linkClaims([claims[0]!], caps)).toHaveLength(0)
    expect(linkClaims([claims[1]!], caps)[0]).toMatchObject({ kind: 'capability_not_live' })
    expect(linkClaims([{ ...claims[0]!, requires_capabilities: ['cap.ghost'] }], caps)[0]).toMatchObject({ kind: 'missing_capability' })
  })
})

describe('operational readiness', () => {
  const ready = { legal_authority: 'ready', operating_playbook: 'ready', partner_coverage: 'ready', document_requirements: 'ready', customer_support: 'ready', failure_modes: 'ready' } as const
  const base: ServiceAuthorityEntry = { country: 'AE', may_sell: true, requires_partner: false, commercial_status: 'not_sellable', status: 'live', derives_from: [], evidence: [], delivery_readiness: { ...ready } }
  it('sellable only when permitted AND deliverable', () => {
    expect(commerciallySellable(base)).toBe(true)
    expect(commerciallySellable({ ...base, delivery_readiness: { ...ready, legal_authority: 'verify' } })).toBe(false)
    expect(commerciallySellable({ ...base, delivery_readiness: undefined })).toBe(false)
  })
})

describe('defineGovernance', () => {
  it('validates injected config and exposes deciders', () => {
    const g = defineGovernance({
      restricted: { version: 1, restricted },
      approved: { version: 1, claims: [{ id: 'c1', text: 'x', requires_capabilities: ['cap.f'] }] },
      capabilities: { version: 1, capabilities: [{ id: 'cap.f', capability_status: 'live' }] },
      serviceAuthority: { version: 1, services: { will: { country: 'AE', may_sell: 'VERIFY' } } },
    })
    expect(g.scan([{ path: 'h.html', text: 'guaranteed approval' }])).toHaveLength(1)
    expect(g.linkClaims()).toHaveLength(0)
    expect(g.unresolvedServiceAuthority()).toEqual(['will'])
  })
})

describe('SEO gates', () => {
  const page: PageEntry = { path: '/services/x', page_type: 'service', canonical: true, indexable: true, target_keywords: ['kw'], required_claims: [], required_capabilities: [], launch_status: 'live', status: 'live', derives_from: [], evidence: [], last_reviewed: '2026-06-01' }
  it('page-authority flags unregistered indexable pages', () => {
    expect(pageAuthorityGate(['/services/x', '/rogue'], [page]).map((i) => i.path)).toEqual(['/rogue'])
  })
  it('cannibalization flags a keyword with >1 canonical page', () => {
    expect(cannibalizationGate([page, { ...page, path: '/dupe' }]).length).toBeGreaterThan(0)
  })
  it('noindex flags a non-live indexable page', () => {
    expect(noindexGate([{ ...page, launch_status: 'draft' }])).toHaveLength(1)
  })
  it('freshness flags missing last_reviewed', () => {
    expect(freshnessGate([{ ...page, last_reviewed: undefined }], { now: Date.parse('2026-06-06') })).toHaveLength(1)
  })
  it('seo-rules flags long title + forbidden pattern', () => {
    const rules = SeoRulesConfig.parse({ forbidden_patterns: ['guaranteed approval'] })
    const issues = seoRulesGate({ path: '/x', title: 'x'.repeat(80), description: 'guaranteed approval' }, rules)
    expect(issues.some((i) => i.detail.includes('title'))).toBe(true)
    expect(issues.some((i) => i.detail.includes('forbidden'))).toBe(true)
  })
})
