// Governance (process): the second half of warp's pre-merge gate contract — the gate is
// "clean" IFF the aggregate error count across ALL checks is zero (zero-tolerance policy),
// and isClean is exactly the predicate errorCount === 0, never "most checks passed".
// Split sibling of governance.test.ts. Real exported APIs only.
import { describe, it, expect } from 'vitest'
import { runWarp, isClean } from '../core'
import { referentialCheck, requiredKeysCheck } from '../checks'

describe('warp governance — zero-tolerance clean predicate', () => {
  it('the gate is clean IFF the aggregate error count is zero (policy = zero tolerance)', async () => {
    // With a single dangling reference the gate must be dirty...
    const dirty = await runWarp({
      checks: [
        referentialCheck('refs', {
          from: () => ['ae', 'zz'],
          to: () => ['ae'],
          message: (v) => `unknown '${v}'`,
        }),
        requiredKeysCheck('keys', {
          required: () => ['ae'],
          present: () => ['ae'],
          message: (k) => `missing '${k}'`,
        }),
      ],
    })
    expect(dirty.errorCount).toBe(1)
    expect(isClean(dirty)).toBe(false)

    // ...and only when EVERY invariant holds does the gate go clean. isClean must be
    // exactly the predicate errorCount === 0 — never "most checks passed".
    const clean = await runWarp({
      checks: [
        referentialCheck('refs', {
          from: () => ['ae'],
          to: () => ['ae'],
          message: (v) => `unknown '${v}'`,
        }),
        requiredKeysCheck('keys', {
          required: () => ['ae'],
          present: () => ['ae'],
          message: (k) => `missing '${k}'`,
        }),
      ],
    })
    expect(clean.errorCount).toBe(0)
    expect(isClean(clean)).toBe(true)
    // Contract: isClean is precisely errorCount === 0 for both reports.
    expect(isClean(dirty)).toBe(dirty.errorCount === 0)
    expect(isClean(clean)).toBe(clean.errorCount === 0)
  })

  it('a single dirty check among many clean ones keeps the whole gate dirty', async () => {
    // Zero-tolerance: one failing invariant is enough to block the merge, even when
    // every other registered check passes. No "majority clean" escape hatch.
    const report = await runWarp({
      checks: [
        requiredKeysCheck('keys', {
          required: () => ['ae', 'sg'],
          present: () => ['ae', 'sg'],
          message: (k) => `missing '${k}'`,
        }),
        referentialCheck('refs', {
          from: () => ['ae', 'qq'],
          to: () => ['ae', 'sg'],
          message: (v) => `unknown '${v}'`,
        }),
      ],
    })
    expect(report.errorCount).toBe(1)
    expect(isClean(report)).toBe(false)
    expect(report.results.find((r) => r.name === 'keys')?.errors).toEqual([])
    expect(report.results.find((r) => r.name === 'refs')?.errors).toEqual(["unknown 'qq'"])
  })
})
