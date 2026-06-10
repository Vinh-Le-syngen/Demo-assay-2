import { describe, it, expect } from 'vitest'
import { defineWarp, runWarp, isClean } from '../core'

describe('runWarp', () => {
  it('aggregates errors across checks and reports clean when none', async () => {
    const config = defineWarp({
      checks: [
        { name: 'a', run: () => [] },
        { name: 'b', run: () => ['b1', 'b2'] },
        { name: 'c', run: async () => ['c1'] },
      ],
    })
    const report = await runWarp(config)
    expect(report.errorCount).toBe(3)
    expect(isClean(report)).toBe(false)
    expect(report.results.find((r) => r.name === 'b')?.errors).toEqual(['b1', 'b2'])
  })

  it('is clean when every check passes', async () => {
    const report = await runWarp({ checks: [{ name: 'a', run: () => [] }] })
    expect(isClean(report)).toBe(true)
    expect(report.results).toHaveLength(1)
  })

  it('runs every check even if earlier ones report errors', async () => {
    const ran: string[] = []
    await runWarp({
      checks: [
        { name: 'a', run: () => { ran.push('a'); return ['x'] } },
        { name: 'b', run: () => { ran.push('b'); return [] } },
      ],
    })
    expect(ran).toEqual(['a', 'b'])
  })
})
