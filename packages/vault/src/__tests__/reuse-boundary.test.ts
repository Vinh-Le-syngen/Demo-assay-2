import { describe, it, expect } from 'vitest'
import { reusableFor, isReusable } from '../core/reuse'
import type { VaultDocument } from '../core/contract'

const NOW = '2026-06-03T00:00:00Z'
const d = (category: string, over: Partial<VaultDocument> = {}, meta: Record<string, unknown> = {}): VaultDocument => ({
  id: `doc_${category}`, ownerAccountId: 'acc', metadata: { category, holder: 'p1', ...meta }, status: 'active',
  currentVersionId: 'v', versions: [], source: 'uploaded', createdAt: NOW, ...over,
})

describe('reuse — boundary', () => {
  it('expiry exactly equal to now is NOT reusable (boundary: expiryDate <= now)', () => {
    const atBoundary = d('passport', {}, { expiryDate: NOW })
    expect(isReusable(atBoundary, NOW)).toBe(false)
  })

  it('expiry one second after now IS reusable (lexicographic ISO comparison)', () => {
    const justValid = d('passport', {}, { expiryDate: '2026-06-03T00:00:01Z' })
    expect(isReusable(justValid, NOW)).toBe(true)
  })

  it('a document with no expiryDate is reusable while active (boundary: undefined expiry)', () => {
    const noExpiry = d('emirates_id')
    expect(noExpiry.metadata.expiryDate).toBeUndefined()
    expect(isReusable(noExpiry, NOW)).toBe(true)
  })

  it('empty requiredTypes yields no reusable and no missing', () => {
    const r = reusableFor([d('passport')], [], NOW)
    expect(r.reusable).toEqual([])
    expect(r.missing).toEqual([])
  })

  it('no documents at all → every required type is missing', () => {
    const r = reusableFor([], ['passport', 'emirates_id'], NOW)
    expect(r.reusable).toEqual([])
    expect(r.missing).toEqual(['passport', 'emirates_id'])
  })

  it('duplicate required type does not duplicate the reusable match but is reported twice in order', () => {
    const r = reusableFor([d('passport')], ['passport', 'passport'], NOW)
    expect(r.reusable).toHaveLength(2)
    expect(r.reusable.every((x) => x.metadata.category === 'passport')).toBe(true)
    expect(r.missing).toEqual([])
  })
})
