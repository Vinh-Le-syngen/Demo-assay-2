// @sys/assay — config (the composition root + cross-language contract). Isomorphic, zod.
// A consumer (Qarar, cadre-os, any project) supplies its own test roots, manifest, and
// which gates to enforce. The CANONICAL taxonomy lives in ./taxonomy and is NOT consumer-
// overridable — consumers classify into it and declare coverage posture. The JSON Schema in
// ../schema mirrors the config; ../dist/taxonomy.schema.json mirrors the manifest.

import { z } from 'zod'
import { CATEGORIES, PLANES, PROFILES, RISKS, ROLES } from './taxonomy'

const categoryEnum = z.enum(CATEGORIES)
const planeEnum = z.enum(PLANES)
const roleEnum = z.enum(ROLES)
const profileEnum = z.enum(PROFILES)
const riskEnum = z.enum(RISKS)

/** The gate identifiers — each finding is tagged with the gate that produced it. */
export const GATE_NAMES = [
  'noUntracked',
  'noStale',
  'requireTriggerForHighRisk',
  'noShells',
  'validClassification',
  'authorSeparation',
  'coverage',
] as const
export type GateName = (typeof GATE_NAMES)[number]
const gateNameEnum = z.enum(GATE_NAMES)

export const assayConfigSchema = z.object({
  /** Directories (relative to the project root) to scan for test files. */
  testRoots: z.array(z.string()).min(1),
  /** Regex (source string) identifying a test file. */
  testPattern: z.string().default('\\.(test|spec)\\.(ts|tsx)$'),
  /** Path (relative to root) to the test manifest JSON. */
  manifestPath: z.string().default('tests/manifest.json'),
  /** Which gates to enforce. A disabled gate is simply not evaluated. */
  gates: z
    .object({
      noUntracked: z.boolean().default(true),
      noStale: z.boolean().default(true),
      requireTriggerForHighRisk: z.boolean().default(true),
      noShells: z.boolean().default(true),
      // category/subtype ∈ canonical taxonomy + plane-subtraction discipline.
      validClassification: z.boolean().default(true),
      // author-role membership (+ required/reviewer for governance-sensitive categories).
      authorSeparation: z.boolean().default(true),
      // coverage floors per profile. Off by default so upgrades don't suddenly fail.
      coverage: z.boolean().default(false),
    })
    .prefault({}),
  /**
   * Gates whose findings are demoted to warn-only — evaluated and printed, but never
   * build-breaking. The per-gate monitor primitive: adopt a gate in `warnOnly` to see its
   * violations without failing CI, then promote it by removing it from this list. (A gate must
   * still be enabled in `gates` to be evaluated at all.)
   */
  warnOnly: z.array(gateNameEnum).default([]),
  /** Heuristic patterns for shell-test detection (overridable per project/framework). */
  shellPatterns: z
    .object({
      expect: z.string().default('\\bexpect\\s*\\('),
      staticSkip: z.string().default('\\b(?:it|describe|test)\\.(?:skip|todo)\\s*\\(\\s*[`\'"]'),
      tautology: z
        .string()
        .default(
          '\\bexpect\\s*\\(\\s*(?:true\\s*\\)\\s*\\.toBe\\s*\\(\\s*true|1\\s*\\)\\s*\\.toBe\\s*\\(\\s*1)\\s*\\)',
        ),
    })
    .prefault({}),
  /** Taxonomy is canonical (in ./taxonomy). Consumers may only register experimental categories. */
  taxonomy: z
    .object({
      // Escape hatch: incubate a future category without polluting canonical coverage.
      // Must be `x-local-*`; warned, never counted toward profiles.
      experimentalCategories: z.array(z.string().regex(/^x-local-/)).default([]),
    })
    .prefault({}),
  /** Coverage posture. The package owns the profiles; the consumer picks + justifies deviations. */
  coverage: z
    .object({
      profile: profileEnum.default('virtual'),
      /** Per-area profile override (area name → profile). */
      areaProfiles: z.record(z.string(), profileEnum).default({}),
      /** Nested per-area, per-category override. `reason` is mandatory and substantive. */
      overrides: z
        .record(
          z.string(),
          z.partialRecord(
            categoryEnum,
            z.object({
              required: z.boolean().optional(),
              min: z.number().int().nonnegative().optional(),
              reason: z.string().min(12),
            }),
          ),
        )
        .default({}),
    })
    .prefault({}),
})

export type AssayConfig = z.infer<typeof assayConfigSchema>

export function defineAssay(config: z.input<typeof assayConfigSchema>): AssayConfig {
  return assayConfigSchema.parse(config)
}

/**
 * The test manifest a project maintains; each test is registered and classified into the
 * canonical taxonomy. Every classification field is optional, so pre-taxonomy manifests still
 * parse — the gates simply no-op on entries that don't declare a `category`.
 */
export const manifestSchema = z.object({
  tests: z.array(
    z.object({
      path: z.string(),
      // Closed risk vocabulary (the one tightening in 0.1.0). high|critical trip the
      // requireTriggerForHighRisk gate and the reviewer requirement.
      risk: riskEnum.optional(),
      triggers: z.array(z.string()).optional(),
      // Canonical classification. Accepts a canonical category or an `x-local-*` experimental
      // category (the engine warns on the latter and never counts it toward coverage).
      category: z.union([categoryEnum, z.string().regex(/^x-local-/)]).optional(),
      // Subtype axis → value (e.g. { kind: 'boundary' }; e2e: { path_kind, profile_kind }).
      subtypes: z.record(z.string(), z.string()).optional(),
      area: z.string().optional(),
      author: roleEnum.optional(),
      reviewer: roleEnum.optional(),
      // Plane override; default derived from the category. Subtracting a default needs a reason.
      planes: z.array(planeEnum).optional(),
      planeOverrideReason: z.string().optional(),
    }),
  ),
})

export type TestManifest = z.infer<typeof manifestSchema>
