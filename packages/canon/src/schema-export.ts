// @sys/canon — JSON Schema emission. The cross-language contract: TS consumes the zod schemas directly;
// other runtimes (cadre-os Python/bash) validate against the emitted JSON Schema. One source of truth.

import { z } from 'zod'
import { schemas } from './core'
import { seoSchemas } from './seo'

/** All named record schemas (core + SEO) in one map. */
export const allSchemas = { ...schemas, ...seoSchemas } as const
export type AnySchemaName = keyof typeof allSchemas
export const allSchemaNames = Object.keys(allSchemas) as AnySchemaName[]

/** Emit JSON Schema for one named schema. */
export function toJsonSchema(name: AnySchemaName): Record<string, unknown> {
  return z.toJSONSchema(allSchemas[name]) as Record<string, unknown>
}

/** Emit JSON Schema for every named schema — `{ [name]: jsonSchema }`. */
export function allJsonSchemas(): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {}
  for (const name of allSchemaNames) out[name] = toJsonSchema(name)
  return out
}
