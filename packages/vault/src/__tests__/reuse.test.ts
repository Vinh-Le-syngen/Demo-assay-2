import { describe, it, expect } from 'vitest'
import { reusableFor, isReusable } from '../core/reuse'
import type { VaultDocument } from '../core/contract'

const NOW = '2026-06-03T00:00:00Z'
const d = (category: string, over: Partial<VaultDocument> = {}, meta: Record<string, unknown> = {}): VaultDocument => ({
  id: `doc_${category}`, ownerAccountId: 'acc', metadata: { category, holder: 'p1', ...meta }, status: 'active',
  currentVersionId: 'v', versions: [], source: 'uploaded', createdAt: NOW, ...over,
})

describe('reuse', () => {
  it('splits required types into reusable (present) and missing', () => {
    const docs = [d('passport'), d('emirates_id')]
    const r = reusableFor(docs, ['passport', 'emirates_id', 'bank_statement'], NOW)
    expect(r.reusable.map((x) => x.metadata.category).sort()).toEqual(['emirates_id', 'passport'])
    expect(r.missing).toEqual(['bank_statement'])
  })

  it('an EXPIRED document is NOT reusable (counts as missing)', () => {
    const expired = d('passport', {}, { expiryDate: '2026-01-01T00:00:00Z' })
    expect(isReusable(expired, NOW)).toBe(false)
    expect(reusableFor([expired], ['passport'], NOW).missing).toEqual(['passport'])
  })

  it('a non-active (superseded/rejected) document is NOT reusable', () => {
    expect(isReusable(d('passport', { status: 'superseded' }), NOW)).toBe(false)
    expect(isReusable(d('passport', { status: 'rejected' }), NOW)).toBe(false)
    expect(reusableFor([d('passport', { status: 'superseded' })], ['passport'], NOW).missing).toEqual(['passport'])
  })

  it('a not-yet-expired document IS reusable', () => {
    const valid = d('passport', {}, { expiryDate: '2030-01-01T00:00:00Z' })
    expect(isReusable(valid, NOW)).toBe(true)
  })

  it('picks the newest document per category', () => {
    const older = d('passport', { id: 'old', createdAt: '2025-01-01T00:00:00Z' })
    const newer = d('passport', { id: 'new', createdAt: '2026-05-01T00:00:00Z' })
    expect(reusableFor([older, newer], ['passport'], NOW).reusable[0]!.id).toBe('new')
  })
})
