// @sys/release — zod schemas (the runtime source of truth). The JSON Schema files under
// schema/ mirror these for non-TS consumers; the tests assert these accept the examples.

import { z } from 'zod'
import type { ReleaseSet, AdoptionRecord } from './types'

const semver = z
  .string()
  .regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, 'expected semver x.y.z')
const calver = z
  .string()
  .regex(/^\d{4}\.\d{2}\.\d+$/, 'expected calendar version YYYY.MM.N')

const evidenceRef = z.object({ source: z.string().min(1), ref: z.string().min(1) })

export const releaseSetSchema = z.object({
  schema_version: z.literal(1),
  name: z.string().min(1),
  version: calver,
  status: z.enum(['draft', 'approved', 'live', 'superseded']),
  packages: z.record(z.string(), semver),
  contracts: z.record(z.string(), z.number().int()).optional(),
  evidence: z.array(evidenceRef).default([]),
  owner: z.string().optional(),
  approved_by: z.string().optional(),
  created_at: z.string().optional(),
  last_reviewed: z.string().optional(),
  expires_at: z.string().optional(),
  superseded_by: z.string().optional(),
  notes: z.string().optional(),
})

export const adoptionRecordSchema = z.object({
  schema_version: z.literal(1),
  product: z.string().min(1),
  adopts: z.object({ release_set: z.string().optional() }).optional(),
  packages: z.record(z.string(), semver),
  contracts: z.record(z.string(), z.number().int()).optional(),
  modes: z.record(z.string(), z.enum(['warn', 'strict', 'off'])).optional(),
})

export function parseReleaseSet(input: unknown): ReleaseSet {
  return releaseSetSchema.parse(input) as ReleaseSet
}

export function parseAdoptionRecord(input: unknown): AdoptionRecord {
  return adoptionRecordSchema.parse(input) as AdoptionRecord
}
