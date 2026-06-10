// Adversarial (protocol-misuse): a contributor crafts migration SQL / config values
// designed to slip a banned (currency-bearing) column past the schema-genericity guard,
// or to abuse the comment/rename escape hatches. The scanner must still flag the real
// leak and must NOT be fooled into clearing it. Real exported APIs only.
import { describe, it, expect } from 'vitest'
import { findBannedColumns, bannedColumnsCheck } from '../checks'
import { runWarp, isClean } from '../core'

const CURRENCY = new Set(['aed', 'usd', 'eur', 'sgd', 'gbp'])

describe('warp adversarial — banned-token evasion attempts', () => {
  it('flags casing/whitespace-obfuscated banned columns', () => {
    // Mixed case + odd spacing must not evade the lowercase, segment-based matcher.
    const sql = 'ALTER   TABLE x   ADD    COLUMN   "Price_AED"   numeric;'
    expect(findBannedColumns(sql, CURRENCY)).toEqual(['price_aed'])
  })

  it('does not let a fake-rename "to" a still-banned name clear the violation', () => {
    // Attacker introduces a banned column, then issues a rename whose TARGET is ALSO
    // banned, hoping the rename clears the original. The new name is still banned, so
    // the renameAway must NOT fire — the leak stays reported.
    const sql = [
      'ALTER TABLE x ADD COLUMN price_aed numeric;',
      'ALTER TABLE x RENAME COLUMN price_aed TO fee_usd;',
    ].join('\n')
    const found = findBannedColumns(sql, CURRENCY)
    expect(found).toContain('price_aed')
    expect(found.length).toBeGreaterThan(0)
  })

  it('a banned-column check still fails the warp gate under an evasion attempt', async () => {
    // End-to-end through the harness: even crafted SQL keeps the report dirty.
    const report = await runWarp({
      checks: [
        bannedColumnsCheck('schema-genericity', {
          // SQL-injection-shaped junk appended after a real banned add-column must not
          // suppress the finding.
          sql: () => "ADD COLUMN price_usd numeric; DROP TABLE users; --'",
          banned: ['aed', 'usd', 'sgd'],
          message: (col) => `column '${col}' bakes in a currency`,
        }),
      ],
    })
    expect(isClean(report)).toBe(false)
    expect(report.results[0]?.errors).toEqual(["column 'price_usd' bakes in a currency"])
  })
})
