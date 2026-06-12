import { z } from 'zod'
import type { IsAlive } from './core'

export const wardenConfigSchema = z.object({
  graceMs: z.number().int().positive().default(30_000),
})

export type WardenConfigInput = z.input<typeof wardenConfigSchema>

export type WardenSeams = {
  isAlive: IsAlive
}

export type WardenConfig = z.infer<typeof wardenConfigSchema> & WardenSeams

export function defineWarden(input: WardenConfigInput & WardenSeams): WardenConfig {
  const parsed = wardenConfigSchema.parse(input)
  return { ...parsed, isAlive: input.isAlive }
}
