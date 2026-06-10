// NEGATIVE (input-validation / schema) — structurally-invalid release-set and adoption records must
// be REJECTED by the parsers, not coerced into something the attestor then trusts. Covers the schema
// boundary: a non-calendar version, an out-of-enum status, a missing required product, and a
// non-semver package pin. Uses only the real exported parseReleaseSet / parseAdoptionRecord.
import { describe, it, expect } from 'vitest'
import { parseReleaseSet, parseAdoptionRecord } from '../schemas'

describe('negative (schema): parseReleaseSet rejects structurally invalid sets', () => {
  it('rejects a non-calendar version and a bad status', () => {
    expect(() =>
      parseReleaseSet({
        schema_version: 1,
        name: 'x',
        version: '1.0.0', // semver, not YYYY.MM.N calver
        status: 'live',
        packages: {},
        evidence: [],
      }),
    ).toThrow()
    expect(() =>
      parseReleaseSet({
        schema_version: 1,
        name: 'x',
        version: '2026.06.0',
        status: 'shipped', // not a ReleaseStatus
        packages: {},
        evidence: [],
      }),
    ).toThrow()
  })

  it('accepts a well-formed set, proving the rejection above is the schema and not a blanket throw', () => {
    const set = parseReleaseSet({
      schema_version: 1,
      name: 'baseline',
      version: '2026.06.0',
      status: 'live',
      packages: { '@sys/canon': '1.1.0' },
      evidence: [{ source: 'pnpm-check', ref: 'passed' }],
    })
    expect(set.name).toBe('baseline')
    expect(set.version).toBe('2026.06.0')
    expect(set.packages).toEqual({ '@sys/canon': '1.1.0' })
  })
})

describe('negative (schema): parseAdoptionRecord rejects structurally invalid locks', () => {
  it('rejects a missing product and a non-semver package pin', () => {
    expect(() => parseAdoptionRecord({ schema_version: 1, packages: {} })).toThrow()
    expect(() =>
      parseAdoptionRecord({ schema_version: 1, product: 'qarar', packages: { '@sys/canon': 'latest' } }),
    ).toThrow()
  })
})
