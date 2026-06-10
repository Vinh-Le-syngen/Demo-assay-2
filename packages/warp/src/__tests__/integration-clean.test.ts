// Integration (intra-system): the "all-clean" composition path of runWarp — several
// registered check BUILDERS over one config bundle that simultaneously satisfies every
// invariant, asserting the harness aggregates their (empty) findings into a clean report.
// Split sibling of integration.test.ts. Real exported APIs only.
import { describe, it, expect } from 'vitest'
import { defineWarp, runWarp, isClean } from '../core'
import { referentialCheck, requiredKeysCheck, bannedColumnsCheck } from '../checks'

const CURRENCY = ['aed', 'usd', 'eur', 'sgd', 'gbp']

describe('warp integration — clean composition over one config bundle', () => {
  it('reports clean only when every composed check finds nothing', async () => {
    // A bundle that satisfies all three invariants simultaneously.
    const clean = defineWarp({
      checks: [
        referentialCheck('matrix-jurisdictions', {
          from: () => ['ae', 'sg'],
          to: () => ['ae', 'sg', 'es'],
          message: (v) => `unknown jurisdiction '${v}'`,
        }),
        requiredKeysCheck('mvp-has-matrix', {
          required: () => ['ae', 'sg'],
          present: () => ['ae', 'sg'],
          message: (k) => `'${k}' has no matrix entry`,
        }),
        bannedColumnsCheck('schema-genericity', {
          sql: () => 'ALTER TABLE invoices ADD COLUMN total_minor bigint;',
          banned: CURRENCY,
          message: (col) => `column '${col}' bakes in a currency`,
        }),
      ],
    })
    const report = await runWarp(clean)
    expect(report.errorCount).toBe(0)
    expect(isClean(report)).toBe(true)
    expect(report.results.every((r) => r.errors.length === 0)).toBe(true)
  })

  it('preserves per-check identity and ordering even when all are clean', async () => {
    // Composition must still surface one result per registered check, in order, so a
    // downstream report can attribute "passed" to each named invariant individually.
    const report = await runWarp(
      defineWarp({
        checks: [
          referentialCheck('matrix-jurisdictions', {
            from: () => ['ae'],
            to: () => ['ae', 'sg'],
            message: (v) => `unknown jurisdiction '${v}'`,
          }),
          requiredKeysCheck('mvp-has-matrix', {
            required: () => ['ae'],
            present: () => ['ae'],
            message: (k) => `'${k}' has no matrix entry`,
          }),
        ],
      }),
    )
    expect(report.results.map((r) => r.name)).toEqual([
      'matrix-jurisdictions',
      'mvp-has-matrix',
    ])
    expect(report.errorCount).toBe(0)
    expect(isClean(report)).toBe(true)
  })
})
