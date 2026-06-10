// @sys/consent — cookie/script consent: category vocabulary + pure decision engine + the
// consent-decision contract + record/store/event seams + a system-of-record service. The host
// supplies the concrete vendor registry, persistence (store), event sink, and UI surfaces. Distinct
// from authenticated processing-consent (e.g. PDPL), which the host owns as a separate SoR.
export * from './core'
export * from './service'
