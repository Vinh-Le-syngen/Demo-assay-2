// @sys/canon core — RECORDS (Governance + Data planes). Schemas, provenance, validation, policy data.
//
// A "governed framework" (strategy, regulatory envelope, product/service authority, claims/content) is:
// a canon (source of truth) + machine-checkable config/registries + gates. @sys/canon owns the RECORDS:
// the config SCHEMAS (cross-language contract), provenance, validation, and policy data. It does NOT
// decide — decisions live in @eng/governance (the engine reads these records + injected policy and
// computes allow/deny/warn). Systems own truth; engines decide. Pure, no IO.

import { z } from 'zod'

/* ───────────────────────── Provenance (every governed row carries it) ───────────────────────── */

export const RowStatus = z.enum(['draft', 'provisional', 'verify', 'approved', 'live', 'superseded'])
export type RowStatus = z.infer<typeof RowStatus>

/** Reusable provenance fields — spread into every registry row so config becomes operational law. */
export const provenanceFields = {
  status: RowStatus.default('draft'),
  derives_from: z.array(z.string()).default([]),
  evidence: z.array(z.object({ source: z.string(), ref: z.string() })).default([]),
  owner: z.string().optional(),
  approved_by: z.string().optional(),
  last_reviewed: z.string().optional(), // ISO date; checked by the freshness gate (engine)
  expires_at: z.string().optional(),
} as const

/* ───────────────────────── Severity & gate policy (policy DATA — injected into the engine) ─────────── */

export const Severity = z.enum(['critical', 'high', 'medium'])
export type Severity = z.infer<typeof Severity>

export type GateName =
  | 'claim-scan'
  | 'schema'
  | 'claim-capability'
  | 'service-authority'
  | 'jurisdiction'
  | 'page-authority'
  | 'cannibalization'
  | 'freshness'
  | 'noindex'
export type GatePolicy = { blocksDeploy: boolean; blocksLaunch: boolean; defaultSeverity: Severity }

/** Default, composable severity policy. Policy data — @eng/governance reads it (and a venture may override). */
export const GATE_POLICY: Record<GateName, GatePolicy> = {
  'claim-scan': { blocksDeploy: true, blocksLaunch: true, defaultSeverity: 'critical' },
  schema: { blocksDeploy: true, blocksLaunch: true, defaultSeverity: 'critical' },
  'claim-capability': { blocksDeploy: true, blocksLaunch: true, defaultSeverity: 'high' },
  'service-authority': { blocksDeploy: false, blocksLaunch: true, defaultSeverity: 'high' },
  jurisdiction: { blocksDeploy: false, blocksLaunch: true, defaultSeverity: 'high' },
  'page-authority': { blocksDeploy: true, blocksLaunch: true, defaultSeverity: 'high' },
  cannibalization: { blocksDeploy: false, blocksLaunch: true, defaultSeverity: 'medium' },
  freshness: { blocksDeploy: false, blocksLaunch: false, defaultSeverity: 'medium' },
  noindex: { blocksDeploy: true, blocksLaunch: true, defaultSeverity: 'high' },
}

/** Legal/disclaimer surfaces legitimately mention restricted phrases to NEGATE them — default scan skip. */
export const DEFAULT_CLAIM_EXCLUDE = /(terms|privacy|data-use|security|legal|cookies?|consent)([/.]|$)/

/* ───────────────────────── Claims (restricted + approved/claim-map) ───────────────────────── */

export const RestrictedClaim = z.object({
  phrase: z.string().min(1),
  severity: Severity.default('high'),
  replacement: z.string().optional(),
})
export type RestrictedClaim = z.infer<typeof RestrictedClaim>

export const RestrictedClaimsConfig = z.object({
  version: z.number().default(1),
  restricted: z.array(RestrictedClaim).default([]),
})
export type RestrictedClaimsConfig = z.infer<typeof RestrictedClaimsConfig>

/** An approved claim IS the claim-map row: positive permission + capability links + prohibited variants. */
export const ApprovedClaim = z.object({
  ...provenanceFields,
  id: z.string(),
  text: z.string(),
  allowed_surfaces: z.array(z.string()).default([]),
  requires_capabilities: z.array(z.string()).default([]),
  prohibited_variants: z.array(z.string()).default([]),
})
export type ApprovedClaim = z.infer<typeof ApprovedClaim>

export const ApprovedClaimsConfig = z.object({
  version: z.number().default(1),
  claims: z.array(ApprovedClaim).default([]),
})
export type ApprovedClaimsConfig = z.infer<typeof ApprovedClaimsConfig>

/* ───────────────────────── Capability inventory (the honesty anchor) ───────────────────────── */

export const CapabilityStatus = z.enum(['live', 'assisted', 'near_term', 'off'])
export type CapabilityStatus = z.infer<typeof CapabilityStatus>

export const Capability = z.object({
  ...provenanceFields,
  id: z.string(),
  capability_status: CapabilityStatus.default('near_term'),
  description: z.string().optional(),
})
export type Capability = z.infer<typeof Capability>

export const CapabilityInventoryConfig = z.object({
  version: z.number().default(1),
  capabilities: z.array(Capability).default([]),
})
export type CapabilityInventoryConfig = z.infer<typeof CapabilityInventoryConfig>

/* ───────────────────────── Strategy choices ───────────────────────── */

export const ChoicesConfig = z.object({
  version: z.number(),
  status: z.string().optional(),
  apex_bet: z.object({ statement: z.string(), horizon: z.string().optional() }),
  wedge: z.object({
    country: z.string(),
    customer: z.string().optional(),
    services: z.array(z.string()).default([]),
  }),
  positioning_constraints: z
    .object({ allowed: z.array(z.string()).default([]), avoid: z.array(z.string()).default([]) })
    .optional(),
  automation_boundary: z
    .object({
      automate: z.array(z.string()).default([]),
      human_review_required: z.array(z.string()).default([]),
    })
    .optional(),
})
export type ChoicesConfig = z.infer<typeof ChoicesConfig>

/* ───────────────────────── Service authority + operational readiness ───────────────────────── */

export const Readiness = z.enum(['ready', 'partial', 'missing', 'verify'])
export type Readiness = z.infer<typeof Readiness>

export const DeliveryReadiness = z.object({
  legal_authority: Readiness.default('verify'),
  operating_playbook: Readiness.default('missing'),
  partner_coverage: Readiness.default('missing'),
  document_requirements: Readiness.default('missing'),
  customer_support: Readiness.default('missing'),
  failure_modes: Readiness.default('missing'),
})
export type DeliveryReadiness = z.infer<typeof DeliveryReadiness>

export const VerifiableBool = z.union([z.boolean(), z.literal('VERIFY')])

export const ServiceAuthorityEntry = z.object({
  ...provenanceFields,
  country: z.string(),
  may_sell: VerifiableBool.default('VERIFY'),
  requires_partner: VerifiableBool.optional(),
  requires_human_review: z.boolean().optional(),
  public_claim_level: z.string().optional(),
  delivery_readiness: DeliveryReadiness.optional(),
  commercial_status: z.enum(['sellable', 'assisted_only', 'not_sellable']).default('not_sellable'),
})
export type ServiceAuthorityEntry = z.infer<typeof ServiceAuthorityEntry>

export const ServiceAuthorityConfig = z.object({
  version: z.number().default(1),
  services: z.record(z.string(), ServiceAuthorityEntry).default({}),
})
export type ServiceAuthorityConfig = z.infer<typeof ServiceAuthorityConfig>

/* ───────────────────────── Named schema registry + validation ───────────────────────── */

export const schemas = {
  restrictedClaims: RestrictedClaimsConfig,
  approvedClaims: ApprovedClaimsConfig,
  capabilityInventory: CapabilityInventoryConfig,
  choices: ChoicesConfig,
  serviceAuthority: ServiceAuthorityConfig,
} as const
export type SchemaName = keyof typeof schemas

export function validate(name: SchemaName, obj: unknown) {
  return schemas[name].safeParse(obj)
}
