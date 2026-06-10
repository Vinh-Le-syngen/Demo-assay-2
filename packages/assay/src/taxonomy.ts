// @sys/assay — the CANONICAL test taxonomy (Governance). Sys owns this vocabulary; every
// consumer classifies into it and cannot redefine it. Ported from cadre-os
// `assay/test-taxonomy.yaml` v3 (see `provenance`). Plain `as const` data so it serialises to
// the emitted taxonomy.json / .yaml artifacts that non-TS runtimes (cadre-os bash) consume.
//
// One source of truth: the Zod enums in ./config and the emitted artifacts are both derived
// from the constants here, so types, runtime validation, and the data file cannot disagree.

/** The closed category vocabulary. Adding/removing a member is a deliberate schema_version bump. */
export const CATEGORIES = [
  'unit',
  'integration',
  'e2e',
  'regression',
  'property',
  'negative',
  'adversarial',
  'stress',
  'governance',
  'canary',
  'smoke',
  'observability',
] as const

export const PLANES = ['control', 'execution', 'data', 'governance', 'observability'] as const

export const ROLES = ['infra', 'qa', 'pm'] as const

export const PROFILES = ['full', 'lightweight', 'virtual'] as const

export const RISKS = ['low', 'medium', 'high', 'critical'] as const

export type Category = (typeof CATEGORIES)[number]
export type Plane = (typeof PLANES)[number]
export type Role = (typeof ROLES)[number]
export type Profile = (typeof PROFILES)[number]
export type Risk = (typeof RISKS)[number]

export type CategorySpec = {
  layer: 'correctness' | 'resilience' | 'compliance' | 'operational'
  description: string
  /** Planes a test of this category exercises unless the manifest overrides. */
  defaultPlanes: readonly Plane[]
  /** Roles permitted to author this category (cadre `author:` list). */
  allowedAuthors: readonly Role[]
  /** Named subtype axes; most categories have one (`kind`), e2e has two. May be empty. */
  subtypeAxes: Readonly<Record<string, readonly string[]>>
}

/** The whole canonical taxonomy as a single serialisable object. */
export const TAXONOMY = {
  schema_version: 2,
  provenance: {
    source: 'cadre-os',
    source_file: 'assay/test-taxonomy.yaml',
    source_schema_version: 3,
    // v2: risk vocabulary aligned to `medium` (was `med` in v1) to match cadre + common usage.
  },
  planes: PLANES,
  roles: ROLES,
  layers: {
    correctness: { description: 'Does it work?' },
    resilience: { description: 'How does it behave under bad/edge conditions?' },
    compliance: { description: 'Are we following our own rules and safety constraints?' },
    operational: { description: 'Is the pipeline usable, observable, and healthy day-to-day?' },
  },
  /** Categories whose author must be present and whose role set is strict (independence). */
  governanceSensitive: ['governance', 'adversarial', 'canary'] as const,
  categories: {
    unit: {
      layer: 'correctness',
      description: 'Smallest pieces, no external systems, fast, deterministic',
      defaultPlanes: ['execution'],
      allowedAuthors: ['infra', 'qa'],
      subtypeAxes: { kind: ['pure', 'io', 'boundary'] },
    },
    integration: {
      layer: 'correctness',
      description: 'Multiple components together (scripts + DB, scripts + git, etc.)',
      defaultPlanes: ['execution', 'data'],
      allowedAuthors: ['infra', 'qa'],
      subtypeAxes: { kind: ['intra-system', 'cross-system', 'external'] },
    },
    e2e: {
      layer: 'correctness',
      description: 'Full pipeline flows (queue → fire → classify → land → reconcile)',
      defaultPlanes: ['control', 'execution', 'data'],
      allowedAuthors: ['infra', 'qa'],
      subtypeAxes: {
        path_kind: ['happy', 'edge', 'failure', 'recovery'],
        profile_kind: ['smoke', 'regression', 'stress', 'governance'],
      },
    },
    regression: {
      layer: 'correctness',
      description: 'Specific previously-broken behaviors; guard against known bugs',
      defaultPlanes: ['execution'],
      allowedAuthors: ['infra', 'qa'],
      subtypeAxes: { kind: ['behavioral', 'performance', 'policy'] },
    },
    property: {
      layer: 'correctness',
      description: 'Invariant/property checks over many generated inputs',
      defaultPlanes: ['execution'],
      allowedAuthors: ['infra'],
      subtypeAxes: { kind: ['idempotent', 'order-invariant', 'monotonic', 'conservation'] },
    },
    negative: {
      layer: 'resilience',
      description: 'Bad inputs, invalid states, error paths (should fail correctly)',
      defaultPlanes: ['execution'],
      allowedAuthors: ['infra', 'qa'],
      subtypeAxes: { kind: ['input-validation', 'authz', 'unsupported'] },
    },
    adversarial: {
      layer: 'resilience',
      description: 'Malicious/hostile inputs or agent behavior; prompt injection, edge payloads',
      defaultPlanes: ['execution', 'governance'],
      allowedAuthors: ['qa'],
      subtypeAxes: { kind: ['prompt-injection', 'resource-abuse', 'protocol-misuse'] },
    },
    stress: {
      layer: 'resilience',
      description: 'High load, many tasks, large inputs; stays within performance/SLO envelopes',
      defaultPlanes: ['execution', 'control', 'observability'],
      allowedAuthors: ['infra'],
      subtypeAxes: { kind: ['throughput', 'soak', 'resource-limits'] },
    },
    governance: {
      layer: 'compliance',
      description: 'Policy checks: risk classes, gate wiring, author separation, N30-style rules',
      defaultPlanes: ['governance', 'control'],
      allowedAuthors: ['qa'],
      subtypeAxes: { kind: ['risk-mapping', 'authz-policy', 'process'] },
    },
    canary: {
      layer: 'compliance',
      description: 'PM-specified spec tests: high-value assertions that must hold to ship',
      defaultPlanes: ['control', 'execution', 'data'],
      allowedAuthors: ['pm'],
      subtypeAxes: { kind: ['business-critical', 'safety-critical', 'customer-simulated'] },
    },
    smoke: {
      layer: 'operational',
      description: 'Very fast broad sanity checks: system is broadly alive',
      defaultPlanes: ['control', 'execution'],
      allowedAuthors: ['infra'],
      subtypeAxes: { kind: ['system-smoke', 'pipeline-smoke', 'env-smoke'] },
    },
    observability: {
      layer: 'operational',
      description: 'Verify logs/metrics/traces are emitted correctly',
      defaultPlanes: ['observability'],
      allowedAuthors: ['infra'],
      subtypeAxes: {},
    },
  } satisfies Record<Category, CategorySpec>,
  profiles: {
    full: {
      requiredCategories: ['unit', 'integration', 'e2e', 'regression', 'negative', 'adversarial', 'governance'],
      minimumPerCategory: 2,
    },
    lightweight: { requiredCategories: ['unit', 'regression'], minimumPerCategory: 1 },
    virtual: { requiredCategories: [], minimumPerCategory: 0 },
  },
} as const

// ── Derived lookups & helpers ──────────────────────────────────────────────

const CATEGORY_SET: ReadonlySet<string> = new Set(CATEGORIES)

export function isCategory(x: string): x is Category {
  return CATEGORY_SET.has(x)
}

export function categorySpec(cat: Category): CategorySpec {
  return TAXONOMY.categories[cat]
}

export function isGovernanceSensitive(cat: Category): boolean {
  return (TAXONOMY.governanceSensitive as readonly string[]).includes(cat)
}

export function profileSpec(p: Profile): { requiredCategories: readonly Category[]; minimumPerCategory: number } {
  return TAXONOMY.profiles[p] as { requiredCategories: readonly Category[]; minimumPerCategory: number }
}

/** True if a string is the experimental escape hatch (warned, never counted in coverage). */
export function isExperimentalCategory(x: string): boolean {
  return x.startsWith('x-local-')
}
