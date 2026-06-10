// Negative (input-validation | unsupported): the harness and check builders must
// behave correctly on malformed / empty / unexpected inputs — surfacing real errors
// rather than throwing or silently passing. Real exported APIs only.
import { describe, it, expect } from 'vitest'
import { runWarp, isClean } from '../core'
import { referentialCheck, requiredKeysCheck } from '../checks'

describe('warp negative — malformed and empty inputs', () => {
  it('an empty check set is vacuously clean (no checks, no errors)', async () => {
    const report = await runWarp({ checks: [] })
    expect(report.results).toEqual([])
    expect(report.errorCount).toBe(0)
    expect(isClean(report)).toBe(true)
  })

  it('referentialCheck flags every value when the target set is empty', async () => {
    // Misconfigured `to` provider (e.g. taxonomy failed to load) must not pass silently:
    // every referenced value becomes a reported dangling reference.
    const c = referentialCheck('refs', {
      from: () => ['ae', 'sg', 'es'],
      to: () => [], // empty target — nothing resolves
      message: (v) => `dangling '${v}'`,
    })
    expect(await c.run()).toEqual(["dangling 'ae'", "dangling 'sg'", "dangling 'es'"])
  })

  it('requiredKeysCheck flags all required keys when nothing is present', async () => {
    const c = requiredKeysCheck('required', {
      required: () => ['ae', 'sg'],
      present: () => [], // nothing present
      message: (k) => `missing '${k}'`,
    })
    expect(await c.run()).toEqual(["missing 'ae'", "missing 'sg'"])
  })
})
