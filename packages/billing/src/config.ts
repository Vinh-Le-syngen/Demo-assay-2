import { z } from 'zod'
import { createJurisdictionPolicy, type JurisdictionPolicySpec } from './policies/factory'
import type { InvoicePolicy } from './core/contract'

export const jurisdictionPolicySpecSchema = z
  .object({
    jurisdiction: z.string().min(1),
    billingMode: z.string().min(1),
    creditNoteStyle: z.enum(['referencing', 'rectifying']),
    currency: z.string().length(3),
    tax: z.record(z.string(), z.unknown()),
    numbering: z.record(z.string(), z.unknown()),
    taxId: z.string().optional(),
  })
  .passthrough()

export type JurisdictionPolicySpecInput = z.input<typeof jurisdictionPolicySpecSchema>

export function defineBilling(input: JurisdictionPolicySpecInput): InvoicePolicy {
  const spec = jurisdictionPolicySpecSchema.parse(input) as JurisdictionPolicySpec
  return createJurisdictionPolicy(spec)
}
