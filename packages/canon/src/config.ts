import { z } from 'zod'
import * as schemas from './core'

export const canonConfigSchema = z.object({})

export type CanonSchemas = typeof schemas

/** Validates config (no-op for a schema-library package) and returns the schema registry. */
export function defineCanon(_input?: z.infer<typeof canonConfigSchema>): CanonSchemas {
  if (_input !== undefined) canonConfigSchema.parse(_input)
  return schemas
}
