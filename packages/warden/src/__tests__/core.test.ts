import { describe, it, expect } from 'vitest'
import {
  classifyWorktrees,
  ownershipHealth,
  reclaimableFindings,
  type IsAlive,
  type WorktreeOwner,
  type WorktreeRecord,
} from '../core'

const NOW = 1_700_000_000_000
const MIN = 60_000

function owned(name: string, pid: number, lastSeenMs = NOW): WorktreeRecord {
  return {
    path: `/wt/${name}`,
    name,
    branch: `feat/${name}`,
    owner: { source: 'session', owner: `agent-${name}`, pid, startedAtMs: NOW, lastSeenMs },
  }
}
function free(name: string): WorktreeRecord {
  return { path: `/wt/${name}`, name, branch: `feat/${name}` }
}

// pid 10 alive, everything else dead
const isAlive: IsAlive = (o: WorktreeOwner) => o.pid === 10

describe('classifyWorktrees', () => {
  it('maps live / stale / free', () => {
    const out = classifyWorktrees([owned('a', 10), owned('b', 20), free('c')], isAlive)
    expect(out.map((r) => [r.name, r.state])).toEqual([
      ['a', 'live'],
      ['b', 'stale'],
      ['c', 'free'],
    ])
    expect(out.find((r) => r.name === 'a')!.detail).toContain('agent-a')
  })
})

describe('claim-held policy (injected isAlive)', () => {
  const policy: IsAlive = (o) => (o.source === 'claim' ? true : o.pid === 10)
  it('a claim-owned worktree is live regardless of pid', () => {
    const claimed: WorktreeRecord = {
      path: '/wt/x',
      name: 'x',
      branch: 'feat/x',
      owner: { source: 'claim', owner: 'human', pid: 99999, startedAtMs: NOW, lastSeenMs: NOW },
    }
    expect(classifyWorktrees([claimed], policy)[0]!.state).toBe('live')
  })
})

describe('ownershipHealth (reuses @sys/sentinel runHealth)', () => {
  it('owned+alive → up, owned+dead → down, free → not_configured', async () => {
    const report = await ownershipHealth([owned('a', 10), owned('b', 20), free('c')], isAlive)
    const byName = Object.fromEntries(report.dependencies.map((d: any) => [d.name, d.status]))
    expect(byName).toEqual({ a: 'up', b: 'down', c: 'not_configured' })
  })

  it('unhealthy iff an OWNED worktree is abandoned (free ones never fail)', async () => {
    expect((await ownershipHealth([owned('a', 10), free('c')], isAlive)).healthy).toBe(true)
    expect((await ownershipHealth([owned('a', 10), owned('b', 20)], isAlive)).healthy).toBe(false)
  })
})

describe('reclaimableFindings (reuses @sys/groundskeeper agingDetector)', () => {
  it('flags abandoned worktrees past the grace window, not the settling ones', () => {
    const records = [owned('a', 10, NOW), owned('b', 20, NOW - 10 * MIN), owned('d', 30, NOW - 1 * MIN)]
    const findings = reclaimableFindings(records, { nowMs: NOW, graceMs: 3 * MIN, isAlive })
    expect(findings.map((f) => f.subject)).toEqual(['b'])
    expect(findings[0]!.detector).toBe('reclaimable-worktrees')
    expect(findings[0]!.severity).toBe('warning')
  })

  it('returns nothing when all owners are alive', () => {
    expect(reclaimableFindings([owned('a', 10)], { nowMs: NOW, graceMs: MIN, isAlive })).toEqual([])
  })
})
