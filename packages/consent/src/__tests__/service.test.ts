import { describe, it, expect, vi } from 'vitest'
import {
  createConsentService,
  buildCategories,
  ALL_CONSENT_CATEGORIES,
  type ConsentRecord,
  type ConsentStore,
  type ConsentEvent,
} from '../index'

// In-memory store double — exercises the service's orchestration over the injected seam.
function memStore() {
  const rows: ConsentRecord[] = []
  const store: ConsentStore = {
    save: vi.fn(async (r) => { rows.push({ ...r }) }),
    latest: vi.fn(async (q) =>
      [...rows]
        .reverse()
        .find((r) => (!q.anonymousId || r.anonymousId === q.anonymousId) && (!q.subjectId || r.subjectId === q.subjectId)) ?? null,
    ),
    link: vi.fn(async (anon, subject) => {
      rows.forEach((r) => { if (r.anonymousId === anon && r.subjectId === null) r.subjectId = subject })
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

describe('createConsentService — record', () => {
  it('persists via the store and emits a changed event carrying source + categories', async () => {
    const { store } = memStore()
    const events: ConsentEvent[] = []
    const svc = createConsentService({ store, sink: { emit: (e) => events.push(e) } })
    await svc.record(record({ source: 'preferences' }))
    expect(store.save).toHaveBeenCalledOnce()
    expect(events).toHaveLength(1)
    const e = events[0]!
    expect(e.type).toBe('changed')
    expect(e.anonymousId).toBe('anon-1')
    expect(e.policyVersion).toBe('2026-06')
    expect((e.detail as { source: string }).source).toBe('preferences')
  })

  it('works without a sink (emit is a no-op, never throws)', async () => {
    const { store } = memStore()
    const svc = createConsentService({ store })
    await expect(svc.record(record())).resolves.toBeUndefined()
    expect(store.save).toHaveBeenCalledOnce()
  })

  it('propagates a store failure', async () => {
    const store: ConsentStore = { save: vi.fn(async () => { throw new Error('db down') }), latest: vi.fn(), link: vi.fn() }
    const svc = createConsentService({ store })
    await expect(svc.record(record())).rejects.toThrow('db down')
  })
})

describe('createConsentService — latest', () => {
  it('returns the most recent matching record by anonymousId, subjectId, or both', async () => {
    const { store } = memStore()
    const svc = createConsentService({ store })
    await svc.record(record({ categories: buildCategories(ALL_CONSENT_CATEGORIES, []) }))
    await svc.record(record({ categories: buildCategories(ALL_CONSENT_CATEGORIES, ['analytics']) }))
    const latest = await svc.latest({ anonymousId: 'anon-1' })
    expect(latest?.categories.analytics).toBe('granted') // the newer one wins
    expect(await svc.latest({ anonymousId: 'nope' })).toBeNull()
  })
})

describe('createConsentService — link (account attachment on login)', () => {
  it('attaches anonymous rows to the subject and is queryable by subjectId', async () => {
    const { store } = memStore()
    const svc = createConsentService({ store })
    await svc.record(record())
    await svc.link('anon-1', 'user-9')
    expect((await svc.latest({ subjectId: 'user-9' }))?.subjectId).toBe('user-9')
  })

  it('only attaches still-anonymous rows (does not steal another user’s)', async () => {
    const { store, rows } = memStore()
    const svc = createConsentService({ store })
    await svc.record(record({ subjectId: 'user-OTHER' })) // already owned
    await svc.record(record()) // anonymous
    await svc.link('anon-1', 'user-9')
    expect(rows.find((r) => r.subjectId === 'user-OTHER')).toBeTruthy() // untouched
    expect(rows.filter((r) => r.subjectId === 'user-9')).toHaveLength(1) // only the anon one moved
  })

  it('is idempotent (re-link finds nothing to move)', async () => {
    const { store } = memStore()
    const svc = createConsentService({ store })
    await svc.record(record())
    await svc.link('anon-1', 'user-9')
    await expect(svc.link('anon-1', 'user-9')).resolves.toBeUndefined()
  })
})

describe('createConsentService — emit passthrough', () => {
  it('forwards arbitrary events to the sink', () => {
    const events: ConsentEvent[] = []
    const svc = createConsentService({ store: memStore().store, sink: { emit: (e) => events.push(e) } })
    svc.emit({ type: 'vendor_blocked', anonymousId: 'a', policyVersion: 'p', registryVersion: 'r', at: 't', detail: { vendor: 'x' } })
    expect(events[0]!.type).toBe('vendor_blocked')
  })
})
