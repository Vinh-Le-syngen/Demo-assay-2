import { z } from 'zod'
import type { ReleaseHost } from './host'

export const releaseConfigSchema = z.object({})

export type ReleaseSeams = {
  host: ReleaseHost
}

export type ReleaseConfig = z.infer<typeof releaseConfigSchema> & ReleaseSeams

export function defineRelease(deps: ReleaseSeams): ReleaseConfig {
  releaseConfigSchema.parse({})
  return deps
}
