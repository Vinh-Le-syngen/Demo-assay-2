import { describe, it, expect } from 'vitest'
import {
  protectedBranchGate,
  authorGate,
  cleanTreeGate,
  protectedPathGate,
} from '../gates'

describe('protectedBranchGate', () => {
  it('blocks a push to a protected target branch', () => {
    const gate = protectedBranchGate({ branches: ['main', 'staging'] })
    expect(gate.run({ targetBranch: 'main' })).toHaveLength(1)
    expect(gate.run({ targetBranch: 'staging' })).toHaveLength(1)
    expect(gate.run({ targetBranch: 'feat/x' })).toEqual([])
  })

  it('can guard the current branch instead (commit context)', () => {
    const gate = protectedBranchGate({ branches: ['main'], against: 'current' })
    expect(gate.run({ branch: 'main' })).toHaveLength(1)
    expect(gate.run({ branch: 'feat/x' })).toEqual([])
    // against=current ignores targetBranch
    expect(gate.run({ targetBranch: 'main', branch: 'feat/x' })).toEqual([])
  })

  it('is a no-op when the relevant branch is unknown', () => {
    expect(protectedBranchGate({ branches: ['main'] }).run({})).toEqual([])
  })
})

describe('authorGate', () => {
  const gate = authorGate({ allowed: ['sinuhe.arroyo@gmail.com'] })
  it('allows an allow-listed author (case-insensitive)', () => {
    expect(gate.run({ authorEmail: 'Sinuhe.Arroyo@gmail.com' })).toEqual([])
  })
  it('blocks an author not in the list', () => {
    expect(gate.run({ authorEmail: 'someone@else.com' })).toHaveLength(1)
  })
  it('is a no-op when author is unknown', () => {
    expect(gate.run({})).toEqual([])
  })
})

describe('cleanTreeGate', () => {
  const gate = cleanTreeGate()
  it('blocks a dirty tree', () => {
    expect(gate.run({ isClean: false })).toHaveLength(1)
  })
  it('passes a clean tree and is a no-op when unknown', () => {
    expect(gate.run({ isClean: true })).toEqual([])
    expect(gate.run({})).toEqual([])
  })
})

describe('protectedPathGate', () => {
  it('flags staged files matching a string prefix or a RegExp', () => {
    const gate = protectedPathGate({ paths: ['supabase/migrations/', /\.env/] })
    const violations = gate.run({
      stagedFiles: ['supabase/migrations/001.sql', 'src/app.ts', '.env.production'],
    })
    expect(violations).toHaveLength(2)
  })
  it('uses a custom message when provided', () => {
    const gate = protectedPathGate({ paths: ['secrets/'], message: 'no secrets in commits' })
    expect(gate.run({ stagedFiles: ['secrets/key.pem'] })).toEqual(['no secrets in commits'])
  })
  it('passes when nothing matches', () => {
    const gate = protectedPathGate({ paths: ['dist/'] })
    expect(gate.run({ stagedFiles: ['src/a.ts'] })).toEqual([])
  })
})
