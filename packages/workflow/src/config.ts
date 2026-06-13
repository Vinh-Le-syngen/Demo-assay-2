import { z } from 'zod'
import type { WorkflowDefinition } from './definition'

const stageSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().optional(),
    actions: z.array(z.string()).optional(),
  })
  .passthrough()

export const workflowDefinitionSchema = z.object({
  serviceType: z.string().min(1),
  country: z.string().min(1),
  stages: z.array(stageSchema),
  transitions: z.record(z.string(), z.array(z.string())),
})

export type WorkflowDefinitionInput = z.input<typeof workflowDefinitionSchema>

export function defineWorkflow(input: WorkflowDefinitionInput): WorkflowDefinition {
  return workflowDefinitionSchema.parse(input) as unknown as WorkflowDefinition
}
