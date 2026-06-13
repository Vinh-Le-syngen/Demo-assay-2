import { z } from 'zod'
import type { DependencyGraph } from './core'

const criticalitySchema = z.enum(['critical', 'high', 'medium', 'low'])

const fileNodeSchema = z
  .object({
    path: z.string().optional(),
    criticality: criticalitySchema.optional(),
    dependsOn: z.array(z.string()).optional(),
    consumers: z.array(z.string()).optional(),
  })
  .passthrough()

export const dependencyGraphSchema = z.object({
  version: z.number().int().positive().optional(),
  files: z.record(z.string(), fileNodeSchema),
})

export type DependencyGraphInput = z.input<typeof dependencyGraphSchema>

export function defineAtlas(input: DependencyGraphInput): DependencyGraph {
  return dependencyGraphSchema.parse(input) as DependencyGraph
}
