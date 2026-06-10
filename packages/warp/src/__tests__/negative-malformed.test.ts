// Negative (input-validation): the scanner and harness on malformed / non-DDL / mixed
// inputs — they must surface real findings (or none) rather than throwing or masking a
// sibling's real errors. Split sibling of negative.test.ts. Real exported APIs only.
import { describe, it, expect } from 'vitest'
import { runWarp, isClean } from '../core'
import { referentialCheck, findBannedColumns } from '../checks'

const CURRENCY = new Set(['aed', 'usd', 'eur', 'sgd', 'gbp'])

describe('warp negative — non-DDL and mixed check inputs', () => {
  it('findBannedColumns returns empty (not throw) on empty / non-DDL SQL', () => {
    expect(findBannedColumns('', CURRENCY)).toEqual([])
    expect(findBannedColumns('SELECT 1;', CURRENCY)).toEqual([])
    // garbage that is not valid DDL must not crash the scanner
    expect(findBannedColumns('@@@ not sql price_aed ;;;', CURRENCY)).toEqual([])
  })

  it('runWarp surfaces a malformed check (no findings) without masking real errors from siblings', async () => {
    const report = await runWarp({
      checks: [
        { name: 'empty-provider', run: () => [] }, // a check that found nothing
        referentialCheck('refs', {
          from: () => ['xx'],
          to: () => ['ae'],
          message: (v) => `unknown '${v}'`,
        }),
      ],
    })
    expect(report.errorCount).toBe(1)
    expect(report.results.find((r) => r.name === 'refs')?.errors).toEqual(["unknown 'xx'"])
    expect(isClean(report)).toBe(false)
  })
})
