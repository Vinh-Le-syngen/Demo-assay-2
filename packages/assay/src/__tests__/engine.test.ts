import { describe, it, expect } from 'vitest'
import { defineAssay, type TestManifest } from '../config'
import { audit, isFatal, findingsForGate, type AssayHost } from '../engine'
import { SHELL_NO_EXPECT, SHELL_STATIC_SKIP, SHELL_TAUTOLOGY } from './_shell-fixtures'

// In-memory host: a map of relative path -> contents. listFiles returns keys under roots.
function memHost(files: Record<string, string>): AssayHost {
  return {
    listFiles(roots) {
      return Object.keys(files).filter((p) => roots.some((r) => p.startsWith(r + '/') || p.startsWith(r)))
    },
    readFile(p) {
      return p in files ? files[p]! : null
    },
  }
}

const config = defineAssay({ testRoots: ['src'], manifestPath: 'tests/manifest.json' })
const GOOD_TEST = 'it("x", () => { expect(1 + 1).toBe(2) })'
const paths = (fs: { path?: string }[]) => fs.map((f) => f.path).sort()

describe('audit', () => {
  it('passes when registry matches disk and tests are real', () => {
    const host = memHost({ 'src/a.test.ts': GOOD_TEST })
    const manifest: TestManifest = { tests: [{ path: 'src/a.test.ts' }] }
    const r = audit(config, manifest, host)
    expect(isFatal(r)).toBe(false)
    expect(r).toMatchObject({ total: 1, onDisk: 1 })
    expect(r.findings).toEqual([])
  })

  it('flags untracked files (on disk, not registered)', () => {
    const host = memHost({ 'src/a.test.ts': GOOD_TEST, 'src/b.test.ts': GOOD_TEST })
    const r = audit(config, { tests: [{ path: 'src/a.test.ts' }] }, host)
    expect(paths(findingsForGate(r, 'noUntracked'))).toEqual(['src/b.test.ts'])
    expect(isFatal(r)).toBe(true)
  })

  it('flags stale entries (registered, missing on disk)', () => {
    const host = memHost({ 'src/a.test.ts': GOOD_TEST })
    const r = audit(config, { tests: [{ path: 'src/a.test.ts' }, { path: 'src/gone.test.ts' }] }, host)
    expect(paths(findingsForGate(r, 'noStale'))).toEqual(['src/gone.test.ts'])
    expect(isFatal(r)).toBe(true)
  })

  it('flags high-risk tests with no trigger', () => {
    const host = memHost({ 'src/a.test.ts': GOOD_TEST })
    const r = audit(config, { tests: [{ path: 'src/a.test.ts', risk: 'high' }] }, host)
    expect(paths(findingsForGate(r, 'requireTriggerForHighRisk'))).toEqual(['src/a.test.ts'])
  })

  it('detects egregious shells: no expect, and statically-skipped blocks', () => {
    const host = memHost({
      'src/noexpect.test.ts': SHELL_NO_EXPECT,
      'src/skipped.test.ts': SHELL_STATIC_SKIP,
    })
    const r = audit(config, { tests: [{ path: 'src/noexpect.test.ts' }, { path: 'src/skipped.test.ts' }] }, host)
    const fatalShells = findingsForGate(r, 'noShells').filter((f) => f.severity === 'fatal')
    expect(paths(fatalShells)).toEqual(['src/noexpect.test.ts', 'src/skipped.test.ts'])
    expect(isFatal(r)).toBe(true)
  })

  it('flags tautologies as soft (warn-only, not fatal)', () => {
    const host = memHost({ 'src/t.test.ts': SHELL_TAUTOLOGY })
    const r = audit(config, { tests: [{ path: 'src/t.test.ts' }] }, host)
    const shells = findingsForGate(r, 'noShells')
    expect(shells).toHaveLength(1)
    expect(shells[0]!.severity).toBe('warn')
    expect(isFatal(r)).toBe(false)
  })

  it('respects disabled gates', () => {
    const loose = defineAssay({ testRoots: ['src'], gates: { noUntracked: false } })
    const host = memHost({ 'src/a.test.ts': GOOD_TEST, 'src/b.test.ts': GOOD_TEST })
    const r = audit(loose, { tests: [{ path: 'src/a.test.ts' }] }, host)
    expect(findingsForGate(r, 'noUntracked')).toEqual([])
  })
})

describe('warnOnly (per-gate monitor)', () => {
  it('demotes one gate to warn without muting the others', () => {
    const cfg = defineAssay({ testRoots: ['src'], warnOnly: ['noUntracked'] })
    const host = memHost({ 'src/a.test.ts': GOOD_TEST, 'src/extra.test.ts': GOOD_TEST })
    const r = audit(cfg, { tests: [{ path: 'src/a.test.ts' }, { path: 'src/gone.test.ts' }] }, host)
    const untracked = findingsForGate(r, 'noUntracked')
    const stale = findingsForGate(r, 'noStale')
    expect(untracked).toHaveLength(1)
    expect(untracked[0]!.severity).toBe('warn') // demoted
    expect(stale[0]!.severity).toBe('fatal') // untouched
    expect(isFatal(r)).toBe(true) // stale keeps it fatal
  })

  it('makes an otherwise-failing audit non-fatal when its only fatal gate is warn-only', () => {
    const cfg = defineAssay({ testRoots: ['src'], warnOnly: ['noUntracked'] })
    const host = memHost({ 'src/a.test.ts': GOOD_TEST, 'src/extra.test.ts': GOOD_TEST })
    const r = audit(cfg, { tests: [{ path: 'src/a.test.ts' }] }, host)
    expect(findingsForGate(r, 'noUntracked')[0]!.severity).toBe('warn')
    expect(isFatal(r)).toBe(false)
  })
})
