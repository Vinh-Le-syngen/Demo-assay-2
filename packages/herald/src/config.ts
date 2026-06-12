import { z } from 'zod'
import type { NotificationPolicy } from './types'

const channelSchema = z.enum(['in_app', 'email', 'whatsapp', 'sms'])
const preferenceModeSchema = z.enum(['respect', 'override_if_required'])
const quietHoursModeSchema = z.enum(['defer', 'bypass_for_deadline'])

export const notificationPolicySchema = z.object({
  channels: z.array(channelSchema),
  preferences: preferenceModeSchema,
  quietHours: quietHoursModeSchema,
  requiresConsent: z.record(z.string(), z.boolean()).optional(),
})

export type NotificationPolicyInput = z.input<typeof notificationPolicySchema>

export function defineHerald(input: NotificationPolicyInput): NotificationPolicy {
  return notificationPolicySchema.parse(input) as NotificationPolicy
}
