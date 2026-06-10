// @eng/governance — `sys-canon init` scaffold. Lays down the COMPRESSED 4-domain governance spine
// (strategy · envelope · product/service-authority · claims) with provenance-bearing, schema-valid
// templates. The point: every venture starts compressed and correct, not as a cathedral. All registry
// templates validate against @sys/canon schemas out of the box.

/** relative path → file content. */
export const SCAFFOLD: Record<string, string> = {
  'index.md': `# Governance

Governed systems for this venture. Canon (source of truth) → machine-checkable registries → gates;
downstream re-derives, never overrides. Engine: \`@sys/canon\` (records) + \`@eng/governance\` (decisions).

## Spine (4 enforced domains)
- **strategy/** — the bet, wedge, moat, non-goals (\`choices.yaml\` is the machine-checkable form).
- **envelope/** — Regulatory Operating Envelope: what may be claimed/sold/delegated (restricted/approved
  claims, service-authority). Constraint AND operating-authority layer.
- **product/service-authority** — lives in \`envelope/service-authority.yaml\` (what's sellable + readiness).
- **claims/** — capability inventory (the honesty anchor; claims must map to a Live capability).

## Honesty gate (two-part)
A public claim ships only if it (1) maps to a **Live** capability in \`claims/capability-inventory.yaml\`
AND (2) passes \`envelope/approved-claims.yaml\` / \`envelope/restricted-claims.yaml\`.
Mechanical: \`sys-canon scan\` · \`sys-canon link\` · \`sys-canon validate\`.

> Everything regulatory-factual is marked \`VERIFY\`/\`[VERIFY]\` until founders/legal confirm. Don't ship unverified.
`,

  'strategy/canon.md': `# Strategy Canon

> The apex. "What this venture is choosing to become." Positioning/product/GTM re-derive from here.
> Machine-checkable form: \`choices.yaml\`. Status: scaffold — fill in real choices.

## The strategic-choices table
| Strategic choice | Answer |
|---|---|
| Primary wedge | [VERIFY] |
| Market thesis | [VERIFY] |
| Moat | [VERIFY] |
| Automation boundary | coordination automated; judgment human |
| Non-goals | see non-goals below |
`,

  'strategy/choices.yaml': `# Strategy choices — machine-checkable (schema: choices). Edit to real values.
version: 1
status: draft
apex_bet:
  statement: "[VERIFY] one sentence: what this venture is choosing to become"
  horizon: "3 years"
wedge:
  country: "[VERIFY]"
  customer: "[VERIFY]"
  services: []
positioning_constraints:
  allowed: []
  avoid: ["guaranteed approval", "fully automated", "legal advice"]
automation_boundary:
  automate: [intake, document_checklist, reminders, progress_tracking]
  human_review_required: [legal_interpretation, eligibility_judgment, final_submission]
`,

  'strategy/decision-log.md': `# Strategy Decision Log

> Append-only. date · decision · rationale · status · owner. \`choices.yaml\` re-derives from DECIDED rows.

| Date | Decision | Rationale | Status | Owner |
|---|---|---|---|---|
| — | (scaffold) | — | open | — |
`,

  'envelope/canon.md': `# Regulatory Operating Envelope

> The permission boundary: a CONSTRAINT layer (what must not be said/done) AND an operating-authority
> layer (what is authorised to sell/delegate/automate/retain). Registries below are agent/CI-gateable.
> ⚠️ Every regulatory-factual cell is \`VERIFY\` until founders/legal confirm.

Registries: \`restricted-claims.yaml\` · \`approved-claims.yaml\` · \`service-authority.yaml\`.
`,

  'envelope/restricted-claims.yaml': `# Do-not-say registry (schema: restrictedClaims). Consumed by \`sys-canon scan\`.
version: 1
restricted:
  - phrase: "guaranteed approval"
    severity: critical
    replacement: "guided application support"
  - phrase: "legal advice"
    severity: high
    replacement: "regulated service coordination"
  - phrase: "fully automated"
    severity: high
    replacement: "workflow automation with human review"
`,

  'envelope/approved-claims.yaml': `# Approved claims = claim-map (schema: approvedClaims). Each maps to capabilities (positive permission).
version: 1
claims:
  - id: claim.example
    text: "[VERIFY] an approved public claim"
    status: draft
    allowed_surfaces: [homepage]
    requires_capabilities: [cap.example]
    prohibited_variants: ["guaranteed approval"]
    derives_from: []
    evidence: []
`,

  'envelope/service-authority.yaml': `# Service authority + operational readiness (schema: serviceAuthority).
# Sellable = permitted (may_sell, no VERIFY) AND deliverable (readiness ready). \`sys-canon\`-checkable.
version: 1
services:
  example_service:
    country: "[VERIFY]"
    may_sell: VERIFY
    requires_partner: VERIFY
    requires_human_review: true
    public_claim_level: coordination_only
    commercial_status: not_sellable
    delivery_readiness:
      legal_authority: verify
      operating_playbook: missing
      partner_coverage: missing
      document_requirements: missing
      customer_support: missing
      failure_modes: missing
`,

  'envelope/decision-log.md': `# Compliance Decisions

> Append-only: date · decision/finding · evidence · owner (legal/founder) · review date.
> Pending items must clear before the related public surface ships.

| Date | Decision / finding | Evidence | Owner | Next review |
|---|---|---|---|---|
| — | (scaffold) | — | legal | — |
`,

  'claims/canon.md': `# Claims / Capability

> The honesty anchor. A public claim ships only if it maps to a **Live** capability here AND an approved
> claim. \`capability-inventory.yaml\` is the machine-checkable truth of what's actually built.
`,

  'claims/capability-inventory.yaml': `# Capability inventory (schema: capabilityInventory). The honesty anchor — claims link to these.
version: 1
capabilities:
  - id: cap.example
    capability_status: near_term   # live | assisted | near_term | off
    description: "[VERIFY] a real capability"
    status: draft
    derives_from: []
    evidence: []
`,
}
