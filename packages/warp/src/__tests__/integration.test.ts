// Integration (intra-system): runWarp composing several registered check BUILDERS
// over a single config bundle, asserting the harness aggregates their independent
// error lists into one report. Real exported APIs only.
import { describe, it, expect } from 'vitest'
import { defineWarp, runWarp, isClean } from '../core'
import { referentialCheck, requiredKeysCheck, bannedColumnsCheck } from '../checks'

// A small synthetic "config bundle" the checks cross-validate, mirroring how a
// project supplies its own data sources (taxonomy, matrix, migrations).
const bundle = {
  jurisdictionsInMatrix: ['ae', 'sg', 'xx'], // 'xx' is dangling
  knownJurisdictions: ['ae', 'sg', 'es'],
  mvpRequired: ['ae', 'sg'],
  matrixPresent: ['ae'], // 'sg' missing
  migrationSql: 'ALTER TABLE invoices ADD COLUMN total_aed numeric;',
}

const CURRENCY = ['aed', 'usd', 'eur', 'sgd', 'gbp']

function buildConfig() {
  return defineWarp({
    checks: [
      referentialCheck('matrix-jurisdictions', {
        from: () => bundle.jurisdictionsInMatrix,
        to: () => bundle.knownJurisdictions,
        message: (v) => `unknown jurisdiction '${v}'`,
      }),
      requiredKeysCheck('mvp-has-matrix', {
        required: () => bundle.mvpRequired,
        present: () => bundle.matrixPresent,
        message: (k) => `'${k}' has no matrix entry`,
      }),
      bannedColumnsCheck('schema-genericity', {
        sql: () => bundle.migrationSql,
        banned: CURRENCY,
        message: (col) => `column '${col}' bakes in a currency`,
      }),
    ],
  })
}

describe('warp integration — multiple builders over one config bundle', () => {
  it('aggregates errors from every registered check into one report', async () => {
    const report = await runWarp(buildConfig())

    // One result per registered check, preserving order and name.
    expect(report.results.map((r) => r.name)).toEqual([
      'matrix-jurisdictions',
      'mvp-has-matrix',
      'schema-genericity',
    ])

    // Each builder contributed exactly its own findings; aggregate is their sum.
    expect(report.results.find((r) => r.name === 'matrix-jurisdictions')?.errors).toEqual([
      "unknown jurisdiction 'xx'",
    ])
    expect(report.results.find((r) => r.name === 'mvp-has-matrix')?.errors).toEqual([
      "'sg' has no matrix entry",
    ])
    expect(report.results.find((r) => r.name === 'schema-genericity')?.errors).toEqual([
      "column 'total_aed' bakes in a currency",
    ])

    expect(report.errorCount).toBe(3)
    expect(isClean(report)).toBe(false)
  })
})
