import { z } from 'zod'
import type { PromotionPolicy } from './core'

const riskSchema = z.enum(['normal', 'risky', 'critical'])

const promotionEdgeSchema = z
  .object({
    from: z.string().min(1),
    to: z.string().min(1),
    risk: riskSchema.optional(),
  })
  .passthrough()

export const promotionPolicySchema = z.object({
  edges: z.array(promotionEdgeSchema).optional(),
  humanApprovalFor: z.array(z.string()).optional(),
  reviewRisk: z.array(riskSchema).optional(),
})

export type PromotionPolicyInput = z.input<typeof promotionPolicySchema>

export function defineGatekeeper(input: PromotionPolicyInput): PromotionPolicy {
  return promotionPolicySchema.parse(input) as PromotionPolicy
}
