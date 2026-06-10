import { describe, it, expect } from 'vitest'
import {
  keyFor,
  diffForBackup,
  manifestChecksum,
  backupFreshness,
  evaluateFreshness,
  type BackupObject,
} from '../core'

const obj = (path: string, size: number, version = ''): BackupObject => ({ path, size, version })

describe('keyFor', () => {
  it('encodes the version into the key (retention-safe)', () => {
    expect(keyFor(obj('a/b.pdf', 1, 'v1'))).toBe('a/b.pdf#v1')
    expect(keyFor(obj('a/b.pdf', 1))).toBe('a/b.pdf')
  })
})

describe('diffForBackup', () => {
  it('returns only objects whose destination key is absent', () => {
    const objects = [obj('a', 1, 'v1'), obj('b', 2, 'v1')]
    const existing = new Set(['a#v1'])
    expect(diffForBackup(objects, existing).map((o) => o.path)).toEqual(['b'])
  })

  it('treats a changed version as needing copy', () => {
    const existing = new Set(['a#v1'])
    expect(diffForBackup([obj('a', 1, 'v2')], existing).map(keyFor)).toEqual(['a#v2'])
  })
})

describe('manifestChecksum', () => {
  it('is order-independent and stable', () => {
    const a = manifestChecksum([obj('x', 1), obj('y', 2)])
    const b = manifestChecksum([obj('y', 2), obj('x', 1)])
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  it('changes when an object resizes', () => {
    expect(manifestChecksum([obj('x', 1)])).not.toBe(manifestChecksum([obj('x', 2)]))
  })
})

describe('freshness', () => {
  const now = new Date('2026-06-03T12:00:00Z')

  it('a null last-success is always stale and alert-worthy', () => {
    expect(backupFreshness(null, now).stale).toBe(true)
    expect(evaluateFreshness(null, now)).toMatchObject({ alert: true })
  })

  it('flags a backup older than maxAgeHours', () => {
    const old = new Date('2026-06-02T00:00:00Z') // 36h
    expect(evaluateFreshness(old, now, 25).alert).toBe(true)
  })

  it('passes a recent backup', () => {
    const recent = new Date('2026-06-03T06:00:00Z') // 6h
    expect(evaluateFreshness(recent, now, 25)).toMatchObject({ alert: false })
  })
})
