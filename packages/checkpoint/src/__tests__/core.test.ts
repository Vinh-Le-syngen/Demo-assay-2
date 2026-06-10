import { describe, it, expect } from 'vitest'
import { defineCheckpoint, runCheckpoint, passed, type Gate } from '../core'

const ok: Gate = { name: 'ok', run: () => [] }
const bad: Gate = { name: 'bad', run: () => ['v1', 'v2'] }

describe('runCheckpoint', () => {
  it('aggregates violations across gates', () => {
    const report = runCheckpoint([ok, bad], {})
    expect(report.violationCount).toBe(2)
    expect(passed(report)).toBe(false)
    expect(report.results.find((r) => r.name === 'bad')?.violations).toEqual(['v1', 'v2'])
  })

  it('passes when every gate is satisfied', () => {
    const report = runCheckpoint([ok, { name: 'ok2', run: () => [] }], {})
    expect(passed(report)).toBe(true)
    expect(report.results).toHaveLength(2)
  })

  it('runs every gate even if an earlier one reports violations', () => {
    const ran: string[] = []
    runCheckpoint(
      [
        { name: 'a', run: () => { ran.push('a'); return ['x'] } },
        { name: 'b', run: () => { ran.push('b'); return [] } },
      ],
      {},
    )
    expect(ran).toEqual(['a', 'b'])
  })

  it('defineCheckpoint is an identity helper', () => {
    const c = defineCheckpoint({ gates: [ok] })
    expect(c.gates).toEqual([ok])
  })
})
