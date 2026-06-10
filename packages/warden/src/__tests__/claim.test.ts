import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { claimWorktree, renewClaim, releaseWorktree, readClaim } from '../claim'

let wt: string
beforeEach(() => {
  wt = mkdtempSync(join(tmpdir(), 'warden-claim-'))
})
afterEach(() => {
  rmSync(wt, { recursive: true, force: true })
})

const NOW = 1_700_000_000_000

describe('claim (atomic mutual exclusion)', () => {
  it('claims a free worktree and reads it back', () => {
    expect(claimWorktree(wt, 'alice', { pid: 4242, nowMs: NOW })).toEqual({ ok: true })
    const owner = readClaim(wt)
    expect(owner).toMatchObject({ source: 'claim', owner: 'alice', pid: 4242 })
    expect(owner!.lastSeenMs).toBeGreaterThan(0)
  })

  it('second claim fails — mkdir is atomic, no double ownership', () => {
    expect(claimWorktree(wt, 'alice', { pid: 1, nowMs: NOW }).ok).toBe(true)
    const second = claimWorktree(wt, 'bob', { pid: 2, nowMs: NOW })
    expect(second.ok).toBe(false)
    expect(second.reason).toBe('already claimed')
    expect(readClaim(wt)!.owner).toBe('alice')
  })

  it('renew bumps last-seen; release frees it (idempotent)', () => {
    claimWorktree(wt, 'alice', { pid: 1, nowMs: NOW })
    const before = readClaim(wt)!.lastSeenMs! // real mkdir mtime
    renewClaim(wt, before + 5 * 60_000)
    expect(readClaim(wt)!.lastSeenMs!).toBeGreaterThan(before)

    releaseWorktree(wt)
    expect(readClaim(wt)).toBeUndefined()
    expect(() => releaseWorktree(wt)).not.toThrow()
  })

  it('readClaim returns undefined when unclaimed', () => {
    expect(readClaim(wt)).toBeUndefined()
  })
})
