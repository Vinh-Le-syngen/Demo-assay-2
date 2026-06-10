// @assay area=sentinel category=negative subtype.kind=input-validation risk=medium author=infra
// Negative: probes that THROW or REJECT. A probe is injected first-party code, but a real DB-ping or
// fetch probe can throw synchronously or reject async. runHealth awaits each probe.run() with no
// internal try/catch, so a throwing probe propagates — this test pins that documented behaviour (the
// failure is surfaced to the caller, never silently swallowed into a false "healthy"). Real exported
// API only (runHealth); the throwing probe is malformed input from the harness's point of view.

import { describe, it, expect } from 'vitest'
import { runHealth, type Probe } from '../core'

const throwingProbe: Probe = {
  name: 'db',
  run: () => {
    throw new Error('connection refused')
  },
}

const rejectingProbe: Probe = {
  name: 'cache',
  run: async () => {
    throw new Error('ECONNRESET')
  },
}

describe('runHealth — failing probes', () => {
  it('propagates a synchronously-thrown probe error rather than reporting a false healthy', async () => {
    await expect(
      runHealth({ probes: [throwingProbe], critical: ['db'] }),
    ).rejects.toThrow('connection refused')
  })

  it('propagates a rejected async probe error rather than swallowing it', async () => {
    await expect(
      runHealth({
        probes: [{ name: 'ok', run: () => ({ name: 'ok', status: 'up' }) }, rejectingProbe],
        critical: ['ok', 'cache'],
      }),
    ).rejects.toThrow('ECONNRESET')
  })

  it('short-circuits on the first throwing probe and does not return a partial report', async () => {
    let reachedSecond = false
    const second: Probe = {
      name: 'second',
      run: () => {
        reachedSecond = true
        return { name: 'second', status: 'up' }
      },
    }
    await expect(
      runHealth({ probes: [throwingProbe, second] }),
    ).rejects.toThrow('connection refused')
    expect(reachedSecond).toBe(false)
  })
})
