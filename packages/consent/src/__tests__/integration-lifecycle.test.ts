// INTEGRATION (intra-system) — the service wired over the in-memory store double driving the
// pure decision engine end of the same system: record a decision, read it back via latest(),
// feed it into canLoadVendor as a ConsentContext. Crosses service + store + engine seams.
import { describe, it, expect, vi } from 'vitest'
import {
  createConsentService,
  canLoadVendor,
  buildCategories,
  ALL_CONSENT_CATEGORIES,
  type ConsentRecord,
  type ConsentStore,
  type ConsentContext,
} from '../index'

// Reuse of the existing in-memory store double pattern (mirrors service.test.ts).
function memStore() {
  const rows: ConsentRecord[] = []
  const store: ConsentStore = {
    save: vi.fn(async (r) => {
      rows.push({ ...r })
    }),
    latest: vi.fn(async (q) =>
      [...rows]
        .reverse()
        .find(
          (r) =>
            (!q.anonymousId || r.anonymousId === q.anonymousId) &&
            (!q.subjectId || r.subjectId === q.subjectId),
        ) ?? null,
    ),
    link: vi.fn(async (anon, subject) => {
      rows.forEach((r) => {
        if (r.anonymousId === anon && r.subjectId === null) r.subjectId = subject
      })
    }),
  }
  return { store, rows }
}

const record = (over: Partial<ConsentRecord> = {}): ConsentRecord => ({
  subjectId: null,
  anonymousId: 'anon-1',
  policyVersion: '2026-06',
  registryVersion: '1',
  categories: buildCategories(ALL_CONSENT_CATEGORIES, ['analytics']),
  source: 'banner',
  createdAt: '2026-06-06T00:00:00.000Z',
  ...over,
})

describe('integration: persisted decision flows into the vendor gate', () => {
  it('a recorded grant, read back via latest(), authorizes the matching vendor', async () => {
    const { store } = memStore()
    const svc = createConsentService({ store })

    // 1) Subject saves a decision granting analytics only.
    await svc.record(record({ categories: buildCategories(ALL_CONSENT_CATEGORIES, ['analytics']) }))

    // 2) Host reads the stored record back.
    const stored = await svc.latest({ anonymousId: 'anon-1' })
    expect(stored).not.toBeNull()

    // 3) Reconstitute the engine context from the persisted record.
    const ctx: ConsentContext = {
      decision: {
        policyVersion: stored!.policyVersion,
        registryVersion: stored!.registryVersion,
        categories: stored!.categories,
        decidedAt: stored!.createdAt,
      },
      policyVersion: stored!.policyVersion,
      registryVersion: stored!.registryVersion,
    }

    // 4) The engine, fed the persisted decision, allows analytics and blocks marketing.
    expect(canLoadVendor({ category: 'analytics', required: false }, ctx)).toBe(true)
    expect(canLoadVendor({ category: 'marketing', required: false }, ctx)).toBe(false)
  })

  it('overwriting the stored decision changes the vendor gate on the next read', async () => {
    const { store } = memStore()
    const svc = createConsentService({ store })

    await svc.record(record({ categories: buildCategories(ALL_CONSENT_CATEGORIES, ['marketing']) }))
    await svc.record(record({ categories: buildCategories(ALL_CONSENT_CATEGORIES, []) })) // withdrew all

    const stored = (await svc.latest({ anonymousId: 'anon-1' }))!
    const ctx: ConsentContext = {
      decision: {
        policyVersion: stored.policyVersion,
        registryVersion: stored.registryVersion,
        categories: stored.categories,
        decidedAt: stored.createdAt,
      },
      policyVersion: stored.policyVersion,
      registryVersion: stored.registryVersion,
    }
    // The newer (withdraw-all) record wins → marketing now blocked.
    expect(canLoadVendor({ category: 'marketing', required: false }, ctx)).toBe(false)
  })
})
