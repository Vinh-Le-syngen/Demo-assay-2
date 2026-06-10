#!/usr/bin/env node
// @sys/release CLI — the attestor entry. Reads versions Changesets produced; never computes
// them. Mutating commands default to dry-run (pass --write). Validation folds findings into a
// ReleaseDecision (allow/deny/warn) and exits 1 on deny.
//
//   sys-release set create   [--name <n>] [--version <calver>] [--draft] [--owner <o>]
//                            [--approved-by <p>] [--expires <iso>] [--write] [--sets <dir>]
//   sys-release set validate [--set <path>] [--sets <dir>] [--strict] [--json]
//   sys-release adoption validate --lock <path> [--set <path>] [--strict] [--json]

import { resolve } from 'node:path'
import { nodeHost } from './node-host'
import { createReleaseSet, validateReleaseSet } from './release-set'
import { validateAdoption, discoverConsumerManifests } from './adoption'
import { decide } from './decide'
import { parseReleaseSet, parseAdoptionRecord } from './schemas'
import type { ReleaseHost } from './host'
import type { ReleaseDecision, ReleaseFinding, ReleaseSet, ReleaseSubject } from './types'

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const has = (flag: string): boolean => process.argv.includes(flag)

function defaultCalver(now: Date): string {
  return `${now.getUTCFullYear()}.${String(now.getUTCMonth() + 1).padStart(2, '0')}.0`
}

function loadSet(host: ReleaseHost, relPath: string): ReleaseSet {
  const raw = host.readFile(relPath)
  if (raw == null) throw new Error(`no release set at ${relPath}`)
  return parseReleaseSet(JSON.parse(raw))
}

/** Print a decision (human or --json) and return its exit code. */
function emit(decision: ReleaseDecision): number {
  if (has('--json')) {
    process.stdout.write(`${JSON.stringify(decision, null, 2)}\n`)
  } else {
    for (const r of decision.reasons) {
      const where = [r.package, r.path].filter(Boolean).join(' ')
      console.error(
        `${r.severity.toUpperCase()} ${r.code}${where ? ` [${where}]` : ''}: ${r.message}`,
      )
    }
    console.error(
      `${decision.decision.toUpperCase()} ${decision.subject.type}:${decision.subject.id} — ${decision.reasons.length} finding(s)`,
    )
  }
  return decision.decision === 'deny' ? 1 : 0
}

function main(): number {
  const positional = process.argv.slice(2).filter((a) => !a.startsWith('-'))
  const [cmd, sub] = positional
  const root = resolve(arg('--root') ?? process.cwd())
  const host = nodeHost(root)
  const strict = has('--strict')
  const setsDir = arg('--sets') ?? '.releases/sets'
  const now = new Date()
  const nowIso = now.toISOString()

  if (cmd === 'set' && sub === 'create') {
    const name = arg('--name') ?? 'baseline'
    const version = arg('--version') ?? defaultCalver(now)
    const draft = has('--draft')
    const set = createReleaseSet({
      host,
      name,
      version,
      status: draft ? 'draft' : 'live',
      evidence: draft ? [] : [{ source: 'pnpm-check', ref: 'passed' }],
      owner: arg('--owner'),
      approvedBy: arg('--approved-by'),
      createdAt: nowIso,
      expiresAt: arg('--expires'),
    })
    const json = `${JSON.stringify(set, null, 2)}\n`
    const dest = `${setsDir}/${name}-${version}.json`
    if (has('--write')) {
      host.writeFile(dest, json)
      console.error(`wrote ${dest} (${Object.keys(set.packages).length} packages, status: ${set.status})`)
    } else {
      process.stdout.write(json)
      console.error(`(dry-run; pass --write to save to ${dest})`)
    }
    return 0
  }

  if (cmd === 'set' && sub === 'validate') {
    const single = arg('--set')
    const paths = single
      ? [single]
      : host.listFiles([setsDir]).filter((p) => p.endsWith('.json'))
    if (paths.length === 0) {
      console.error('set validate: no release sets found — nothing to check')
      return 0
    }
    const findings: ReleaseFinding[] = []
    const ids: string[] = []
    const liveVersions = new Map<string, string>()
    for (const p of paths) {
      const set = loadSet(host, p)
      ids.push(`${set.name}@${set.version}`)
      findings.push(...validateReleaseSet({ set, host, now: nowIso }))
      if (set.status === 'live' || set.status === 'approved') {
        const prev = liveVersions.get(set.version)
        if (prev) {
          findings.push({
            code: 'release_set_version_duplicate',
            severity: 'blocker',
            message: `release-set version ${set.version} used by both "${prev}" and "${set.name}"`,
          })
        } else {
          liveVersions.set(set.version, set.name)
        }
      }
    }
    const subject: ReleaseSubject = { type: 'release_set', id: ids.join(',') }
    return emit(decide({ subject, findings, decidedAt: nowIso, strict }))
  }

  if (cmd === 'adoption' && sub === 'validate') {
    const lockPath = arg('--lock') ?? 'sys.lock.json'
    const lockRaw = host.readFile(lockPath)
    if (lockRaw == null) {
      console.error(`adoption validate: no lock at ${lockPath}`)
      return 1
    }
    const lock = parseAdoptionRecord(JSON.parse(lockRaw))
    const manifests = discoverConsumerManifests(host) // gap A: all manifests, not just root
    const rootRaw = host.readFile('package.json')
    const overrides = rootRaw
      ? ((JSON.parse(rootRaw) as { pnpm?: { overrides?: Record<string, string> } }).pnpm
          ?.overrides ?? undefined)
      : undefined
    const setArg = arg('--set')
    const releaseSet = setArg ? loadSet(host, setArg) : undefined
    const findings = validateAdoption({ lock, manifests, host, releaseSet, overrides })
    const subject: ReleaseSubject = { type: 'adoption', id: lock.product }
    return emit(decide({ subject, findings, decidedAt: nowIso, strict }))
  }

  console.error(
    'usage: sys-release <set create | set validate | adoption validate> [flags]',
  )
  return 1
}

process.exit(main())
