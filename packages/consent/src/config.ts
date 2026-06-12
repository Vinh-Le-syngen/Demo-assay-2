import { z } from 'zod'
import type { ConsentStore, ConsentEventSink } from './core'

const consentVendorSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    category: z.string().min(1),
    required: z.boolean().optional(),
  })
  .passthrough()

export const consentConfigSchema = z.object({
  policyVersion: z.string().min(1),
  registryVersion: z.string().min(1),
  vendors: z.array(consentVendorSchema),
})

export type ConsentConfigInput = z.input<typeof consentConfigSchema>

export type ConsentSeams = {
  store: ConsentStore
  sink?: ConsentEventSink
}

export type ConsentConfig = z.infer<typeof consentConfigSchema> & ConsentSeams

export function defineConsent(input: ConsentConfigInput & ConsentSeams): ConsentConfig {
  const parsed = consentConfigSchema.parse(input)
  return { ...parsed, store: input.store, sink: input.sink }
}
