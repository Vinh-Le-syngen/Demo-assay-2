// Adversarial (prompt-injection / protocol-misuse) — a copywriter or content-gen agent trying to slip a
// restricted compliance claim past the scanner. The gate must catch evasion through case-mangling, burying
// the phrase deep in a long line, and registry/content case asymmetry; it must cap excerpts so a giant
// payload line cannot abuse the reporter; and the SEO forbidden-pattern gate must likewise resist case
// evasion. We also pin the ONE documented weakening surface (caseInsensitive:false) so future callers know
// disabling it re-opens the bypass — the contract, not an accident.

import { describe, it, expect } from 'vitest'
import type { RestrictedClaim } from '@sys/canon'
import { scanClaims } from '../decide'

const restricted: RestrictedClaim[] = [{ phrase: 'guaranteed approval', severity: 'critical' }]

describe('scanClaims — resists claim-scan evasion (adversarial)', () => {
  it('still flags a phrase mangled with alternating case', () => {
    const v = scanClaims([{ path: 'web/home.html', text: 'GuArAnTeEd ApProVaL within 24h' }], restricted)
    expect(v).toHaveLength(1)
    expect(v[0]).toMatchObject({ phrase: 'guaranteed approval', severity: 'critical' })
  })

  it('still flags a phrase buried deep in a long line, with the correct line number', () => {
    const noise = 'lorem ipsum dolor sit amet '.repeat(40)
    const text = ['intro line', 'second line', `${noise}guaranteed approval offered here`].join('\n')
    const v = scanClaims([{ path: 'web/landing.html', text }], restricted)
    expect(v).toHaveLength(1)
    expect(v[0]!.line).toBe(3)
  })

  it('catches content/registry case asymmetry (mixed-case registry vs lowercase content and vice versa)', () => {
    const mixedRegistry: RestrictedClaim[] = [{ phrase: 'Guaranteed Approval', severity: 'critical' }]
    expect(scanClaims([{ path: 'a.html', text: 'guaranteed approval' }], mixedRegistry)).toHaveLength(1)
    expect(scanClaims([{ path: 'a.html', text: 'GUARANTEED APPROVAL' }], restricted)).toHaveLength(1)
  })

  it('caps the reported excerpt so an oversized payload line cannot abuse the reporter (resource-abuse)', () => {
    const huge = 'guaranteed approval ' + 'x'.repeat(50_000)
    const v = scanClaims([{ path: 'a.html', text: huge }], restricted)
    expect(v).toHaveLength(1)
    expect(v[0]!.excerpt.length).toBeLessThanOrEqual(200)
  })

  it('PINS the weakening surface: caseInsensitive:false re-opens case-mismatch bypass', () => {
    // Documented contract — callers must NOT disable case-insensitivity for compliance scans.
    expect(scanClaims([{ path: 'a.html', text: 'GUARANTEED APPROVAL' }], restricted, { caseInsensitive: false })).toHaveLength(0)
    // The default (case-insensitive) closes it.
    expect(scanClaims([{ path: 'a.html', text: 'GUARANTEED APPROVAL' }], restricted)).toHaveLength(1)
  })
})
