// @sys/gatekeeper — the promotion gate. A pure ALLOW/DENY/REVIEW verdict over the facts of a
// proposed branch promotion (allowed edge, tests green, gate violations, risk, human approval),
// plus a canonical staging-first policy. The caller supplies the facts (tests from CI, gate
// violations from @sys/checkpoint); this package owns only the decision. Library or the
// `sys-gatekeeper` CLI. Extracted from cadre-os SYS-GATEKEEPER's promotion role.
export * from './core'
export * from './config'
