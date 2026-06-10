#!/usr/bin/env node
// @sys/warden CLI — `sys-warden [status|claim [name]|release]`. Shows who owns which git
// worktree (decided via @sys/sentinel + @sys/groundskeeper); `claim`/`release` manage an
// explicit local lease. `status` is read-only; claim writes only a local .wt-claim.d marker.

import { userInfo } from 'node:os'
import {
  classifyWorktrees,
  ownershipHealth,
  reclaimableFindings,
} from './core'
import { collectRecords, currentWorktree, isAlive, DEFAULT_STALE_GRACE_MS } from './adapters'
import { claimWorktree, releaseWorktree } from './claim'

function pad(s: string, n: number): string {
  const t = s.length > n - 1 ? `${s.slice(0, n - 2)}… ` : s
  return t.length >= n ? t : t + ' '.repeat(n - t.length)
}

async function status(): Promise<number> {
  const records = collectRecords()
  const rows = classifyWorktrees(records, isAlive)
  const reclaimable = new Set(
    reclaimableFindings(records, { nowMs: Date.now(), graceMs: DEFAULT_STALE_GRACE_MS, isAlive }).map(
      (f) => f.subject,
    ),
  )
  const health = await ownershipHealth(records, isAlive)

  console.log(`${pad('WORKTREE', 32)}${pad('BRANCH', 28)}${pad('STATUS', 13)}OWNER`)
  console.log(`${pad('--------', 32)}${pad('------', 28)}${pad('------', 13)}-----`)
  for (const r of rows) {
    const state = r.state === 'stale' && reclaimable.has(r.name) ? 'reclaimable' : r.state
    console.log(`${pad(r.name, 32)}${pad(r.branch, 28)}${pad(state, 13)}${r.detail}`)
  }
  const down = health.dependencies.filter((d: any) => d.status === 'down').map((d: any) => d.name)
  console.log(
    `\nfleet: ${health.healthy ? 'healthy' : `ATTENTION — abandoned: ${down.join(', ')}`}` +
      (reclaimable.size ? ` · reclaimable: ${[...reclaimable].join(', ')}` : ''),
  )
  return 0
}

async function main(): Promise<number> {
  const cmd = process.argv[2] ?? 'status'
  if (cmd === 'claim') {
    const owner = process.argv[3] ?? process.env.QARAR_AGENT ?? process.env.SYS_AGENT ?? userInfo().username
    const wt = currentWorktree()
    const r = claimWorktree(wt, owner, { pid: process.pid, nowMs: Date.now() })
    console.log(r.ok ? `claimed ${wt} for ${owner}` : `claim failed: ${r.reason}`)
    return r.ok ? 0 : 1
  }
  if (cmd === 'release') {
    const wt = currentWorktree()
    releaseWorktree(wt)
    console.log(`released ${wt}`)
    return 0
  }
  return status()
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`sys-warden: ${(err as Error).message}`)
    process.exit(1)
  },
)
