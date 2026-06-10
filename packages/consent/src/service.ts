// The consent system-of-record service: thin orchestration over the injected store + event sink.
// The host supplies the store (e.g. Supabase) and the sink (logs now, @sys/sentinel later);
// @sys/consent owns the contract + the flow. Persisting a decision also emits a 'changed' event.
import type { ConsentRecord, ConsentStore, ConsentEvent, ConsentEventSink } from './core'

export interface ConsentService {
  /** Persist a consent record + emit a 'changed' event. */
  record(record: ConsentRecord): Promise<void>
  /** Most recent stored record for an anonymous id and/or subject. */
  latest(query: { anonymousId?: string; subjectId?: string }): Promise<ConsentRecord | null>
  /** Attach an anonymous id's records to a subject (on login). */
  link(anonymousId: string, subjectId: string): Promise<void>
  /** Emit a consent event (banner shown, vendor blocked, reprompt, …). */
  emit(event: ConsentEvent): void
}

export function createConsentService(deps: {
  store: ConsentStore
  sink?: ConsentEventSink
}): ConsentService {
  const emit = (event: ConsentEvent): void => deps.sink?.emit(event)
  return {
    async record(record) {
      await deps.store.save(record)
      emit({
        type: 'changed',
        anonymousId: record.anonymousId,
        subjectId: record.subjectId,
        policyVersion: record.policyVersion,
        registryVersion: record.registryVersion,
        at: record.createdAt,
        detail: { source: record.source, categories: record.categories },
      })
    },
    latest: (query) => deps.store.latest(query),
    async link(anonymousId, subjectId) {
      await deps.store.link(anonymousId, subjectId)
    },
    emit,
  }
}
