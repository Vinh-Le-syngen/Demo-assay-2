import { describe, it, expect } from 'vitest'
import {
  referentialCheck,
  requiredKeysCheck,
  hasBannedToken,
  findBannedColumns,
  bannedColumnsCheck,
} from '../checks'

const CURRENCY = new Set(['aed', 'usd', 'eur', 'sgd', 'gbp'])

describe('referentialCheck', () => {
  it('flags values absent from the target set', async () => {
    const c = referentialCheck('matrix-jurisdictions', {
      from: () => ['ae', 'sg', 'xx'],
      to: () => ['ae', 'sg', 'es'],
      message: (v) => `unknown jurisdiction '${v}'`,
    })
    expect(await c.run()).toEqual(["unknown jurisdiction 'xx'"])
  })
})

describe('requiredKeysCheck', () => {
  it('flags required keys that are missing', async () => {
    const c = requiredKeysCheck('mvp-has-matrix', {
      required: () => ['ae', 'sg'],
      present: () => ['ae'],
      message: (k) => `'${k}' has no matrix entry`,
    })
    expect(await c.run()).toEqual(["'sg' has no matrix entry"])
  })
})

describe('hasBannedToken', () => {
  it('detects a banned currency segment, case-insensitively', () => {
    expect(hasBannedToken('price_AED', CURRENCY)).toBe(true)
    expect(hasBannedToken('amount_minor', CURRENCY)).toBe(false)
    expect(hasBannedToken('usd_balance', CURRENCY)).toBe(true)
  })
})

describe('findBannedColumns', () => {
  it('flags add column with a banned token', () => {
    const sql = 'ALTER TABLE x ADD COLUMN price_aed numeric;'
    expect(findBannedColumns(sql, CURRENCY)).toEqual(['price_aed'])
  })

  it('flags create-table columns with a banned token', () => {
    const sql = 'create table x (\n  id uuid,\n  fee_usd numeric,\n  note text\n);'
    expect(findBannedColumns(sql, CURRENCY)).toEqual(['fee_usd'])
  })

  it('clears a column later renamed to a neutral name', () => {
    const sql = [
      'ALTER TABLE x ADD COLUMN price_aed numeric;',
      'ALTER TABLE x RENAME COLUMN price_aed TO price_minor;',
    ].join('\n')
    expect(findBannedColumns(sql, CURRENCY)).toEqual([])
  })

  it('ignores banned tokens inside line comments', () => {
    const sql = '-- price_aed is fine in a comment\ncreate table x (\n  id uuid\n);'
    expect(findBannedColumns(sql, CURRENCY)).toEqual([])
  })

  it('returns empty for a generic schema', () => {
    const sql = 'create table x (\n  id uuid,\n  amount_minor bigint\n);'
    expect(findBannedColumns(sql, CURRENCY)).toEqual([])
  })
})

describe('bannedColumnsCheck', () => {
  it('wraps findBannedColumns as a named check', async () => {
    const c = bannedColumnsCheck('schema-genericity', {
      sql: () => 'ADD COLUMN balance_sgd numeric;',
      banned: ['aed', 'sgd', 'usd'],
      message: (col) => `column '${col}' bakes in a currency`,
    })
    expect(await c.run()).toEqual(["column 'balance_sgd' bakes in a currency"])
  })
})
