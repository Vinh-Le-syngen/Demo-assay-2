// Adversarial (protocol-misuse): further banned-token evasion attempts — hiding the
// clearing rename inside a comment, and burying the currency mid-identifier. The scanner
// must still flag the real leak. Split sibling of adversarial.test.ts. Real exported APIs only.
import { describe, it, expect } from 'vitest'
import { findBannedColumns, hasBannedToken } from '../checks'

const CURRENCY = new Set(['aed', 'usd', 'eur', 'sgd', 'gbp'])

describe('warp adversarial — comment and identifier-burial evasion', () => {
  it('does not honor a "rename to neutral" hidden inside a line comment', () => {
    // The clearing rename is commented out, so it must not apply; the banned column
    // introduced in live DDL stays flagged.
    const sql = [
      'ALTER TABLE x ADD COLUMN balance_sgd numeric;',
      '-- ALTER TABLE x RENAME COLUMN balance_sgd TO balance_minor;',
    ].join('\n')
    expect(findBannedColumns(sql, CURRENCY)).toEqual(['balance_sgd'])
  })

  it('flags a banned token buried among neutral segments of a long identifier', () => {
    // Burying the currency mid-identifier does not change that a segment is banned.
    expect(hasBannedToken('customer_eur_running_total', CURRENCY)).toBe(true)
    const sql = 'create table t (\n  id uuid,\n  customer_eur_running_total numeric\n);'
    expect(findBannedColumns(sql, CURRENCY)).toEqual(['customer_eur_running_total'])
  })

  it('does not treat a neutral identifier whose substring resembles a currency as banned', () => {
    // 'measured' contains the substring 'eur' but no SEGMENT equals a banned token, so a
    // segment-based matcher must NOT raise a false positive — evasion guards cut both ways.
    expect(hasBannedToken('measured_total_minor', CURRENCY)).toBe(false)
    const sql = 'ALTER TABLE x ADD COLUMN measured_total_minor numeric;'
    expect(findBannedColumns(sql, CURRENCY)).toEqual([])
  })
})
