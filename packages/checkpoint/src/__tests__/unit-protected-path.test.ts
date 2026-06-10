// @assay area=checkpoint category=unit subtype.kind=pure risk=medium author=infra
// Unit (pure): protectedPathGate's matching semantics in isolation — string prefix vs RegExp,
// multiple matches yielding multiple violations, and the custom-message substitution. Pure function,
// no IO, deterministic. Complements core.test.ts (the harness) with focused gate-builder coverage.

import { describe, it, expect } from 'vitest'
import { protectedPathGate } from '../gates'

describe('protectedPathGate matching semantics', () => {
  it('emits one violation per matching staged file (string prefix and RegExp combined)', () => {
    const gate = protectedPathGate({ paths: ['supabase/migrations/', /\.lock$/] })
    const v = gate.run({
      stagedFiles: [
        'supabase/migrations/001.sql', // prefix hit
        'supabase/migrations/002.sql', // prefix hit
        'pnpm-lock.yaml', // no hit (ends in .yaml, not .lock)
        'src/index.ts', // no hit
        'package-lock.json', // no hit (ends in .json, not .lock)
      ],
    })
    // Only the two migration files end up matching (\.lock$ requires the path to END in .lock).
    expect(v).toHaveLength(2)
  })

  it('a single file matching two different patterns is reported once per matching file, not per pattern', () => {
    // filter() keeps the file once even if several configured paths would match it.
    const gate = protectedPathGate({ paths: ['secrets/', /secrets\//] })
    expect(gate.run({ stagedFiles: ['secrets/key.pem'] })).toHaveLength(1)
  })

  it('substitutes the custom message for every hit when one is provided', () => {
    const gate = protectedPathGate({ paths: ['dist/'], message: 'no build artifacts' })
    expect(gate.run({ stagedFiles: ['dist/a.js', 'dist/b.js'] })).toEqual([
      'no build artifacts',
      'no build artifacts',
    ])
  })

  it('default message echoes the offending path', () => {
    const gate = protectedPathGate({ paths: ['x/'] })
    expect(gate.run({ stagedFiles: ['x/y'] })).toEqual(['staged change to protected path: x/y'])
  })
})
