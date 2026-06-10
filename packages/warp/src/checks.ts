// @sys/warp — reusable check builders. The generic, cross-project value: referential
// integrity, required-mapping, and the schema-genericity (banned-token) SQL scanner.
// Projects compose these with their own data sources.

import type { Check } from './core'

/** Every value yielded by `from` must exist in the `to` set, else `message(value)`. */
export function referentialCheck(
  name: string,
  opts: {
    from: () => Iterable<string>
    to: () => Iterable<string>
    message: (value: string) => string
  },
): Check {
  return {
    name,
    run() {
      const toSet = new Set(opts.to())
      const errors: string[] = []
      for (const value of opts.from()) {
        if (!toSet.has(value)) errors.push(opts.message(value))
      }
      return errors
    },
  }
}

/** Every `required` key must be present in `present`, else `message(key)`. */
export function requiredKeysCheck(
  name: string,
  opts: {
    required: () => Iterable<string>
    present: () => Iterable<string>
    message: (key: string) => string
  },
): Check {
  return {
    name,
    run() {
      const have = new Set(opts.present())
      const errors: string[] = []
      for (const key of opts.required()) {
        if (!have.has(key)) errors.push(opts.message(key))
      }
      return errors
    },
  }
}

// ── Schema-genericity guard ─────────────────────────────────────────────────
// An identifier "carries a banned token" if any `_`-segment is in the banned set
// (e.g. a currency code baked into a column name). Parameterized — the project
// supplies the banned tokens.

export function hasBannedToken(ident: string, banned: ReadonlySet<string>): boolean {
  return ident
    .toLowerCase()
    .split('_')
    .some((seg) => banned.has(seg))
}

/**
 * Given concatenated migration SQL, returns column names introduced with a banned
 * token AND not later renamed to a neutral name. Empty = schema is generic. Pure.
 */
export function findBannedColumns(migrationSql: string, banned: ReadonlySet<string>): string[] {
  const sql = migrationSql.replace(/--[^\n]*/g, '') // strip line comments
  const introduced = new Set<string>()

  // `add column [if not exists] <name>`
  for (const m of sql.matchAll(/\badd\s+column\s+(?:if\s+not\s+exists\s+)?"?([a-z_][a-z0-9_]*)"?/gi)) {
    const col = m[1]!
    if (hasBannedToken(col, banned)) introduced.add(col.toLowerCase())
  }

  // `create table ... ( <body> );` — leading identifier of each column-def line
  for (const t of sql.matchAll(/create\s+table[^(]*\(([\s\S]*?)\n\s*\)\s*;/gi)) {
    for (const rawLine of t[1]!.split('\n')) {
      const col = rawLine.trim().replace(/,$/, '').match(/^"?([a-z_][a-z0-9_]*)"?\s+[a-z]/i)
      if (col && hasBannedToken(col[1]!, banned)) introduced.add(col[1]!.toLowerCase())
    }
  }

  // `rename column <old> to <new>` clears <old> when <new> is neutral.
  const renamedAway = new Set<string>()
  for (const m of sql.matchAll(/rename\s+column\s+"?([a-z_][a-z0-9_]*)"?\s+to\s+"?([a-z_][a-z0-9_]*)"?/gi)) {
    if (!hasBannedToken(m[2]!, banned)) renamedAway.add(m[1]!.toLowerCase())
  }

  return [...introduced].filter((c) => !renamedAway.has(c)).sort()
}

/** A ready-made check wrapping findBannedColumns over a SQL provider. */
export function bannedColumnsCheck(
  name: string,
  opts: { sql: () => string; banned: Iterable<string>; message: (col: string) => string },
): Check {
  const bannedSet = new Set([...opts.banned].map((b) => b.toLowerCase()))
  return {
    name,
    run() {
      return findBannedColumns(opts.sql(), bannedSet).map(opts.message)
    },
  }
}
