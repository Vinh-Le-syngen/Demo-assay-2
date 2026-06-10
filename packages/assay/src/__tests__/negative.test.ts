// Negative (input-validation): invalid config/manifest shapes must be rejected at the schema
// boundary. Covers defineAssay/manifestSchema rejection. The runtime-gate half (missing-file,
// invalid-subtype handling) lives in negative-runtime.test.ts.

import { describe, it, expect } from 'vitest'
import { defineAssay, manifestSchema } from '../config'

describe('schema rejection (input-validation)', () => {
  it('rejects structurally invalid config shapes', () => {
    // testRoots is required and non-empty; an empty experimental category must match x-local-*;
    // an override reason shorter than 12 chars is rejected.
    expect(() => defineAssay({ testRoots: [] })).toThrow()
    // @ts-expect-error testRoots must be string[]
    expect(() => defineAssay({ testRoots: 'src' })).toThrow()
    expect(() => defineAssay({ testRoots: ['src'], taxonomy: { experimentalCategories: ['notlocal'] } })).toThrow()
    expect(() =>
      defineAssay({
        testRoots: ['src'],
        coverage: { overrides: { core: { e2e: { required: false, reason: 'short' } } } },
      }),
    ).toThrow()
  })

  it('rejects malformed manifest entries', () => {
    // path is required; risk and category are closed vocabularies.
    expect(() => manifestSchema.parse({ tests: [{ risk: 'high' }] })).toThrow() // no path
    expect(() => manifestSchema.parse({ tests: [{ path: 'a.test.ts', risk: 'spicy' }] })).toThrow()
    expect(() => manifestSchema.parse({ tests: [{ path: 'a.test.ts', category: 'bogus' }] })).toThrow()
    expect(() => manifestSchema.parse({ tests: [{ path: 'a.test.ts', author: 'ceo' }] })).toThrow()
    // A pre-taxonomy entry (path only) is intentionally still valid.
    expect(() => manifestSchema.parse({ tests: [{ path: 'a.test.ts' }] })).not.toThrow()
  })
})
