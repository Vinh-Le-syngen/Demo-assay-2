// @sys/auth — config (Control composition root). Isomorphic, NO secrets.
// defineAuth() validates and normalizes the app's auth configuration. Secrets are
// passed separately to the server surface; this object is safe to share with the client.

import { z } from 'zod'

/** A method descriptor (declarative). Method plugins produce these; UI renders from them. */
export const authMethodDescriptorSchema = z.object({
  id: z.enum(['passkey', 'nationalId', 'password', 'magicLink', 'oauth', 'otp']),
  capability: z.string(),
  ui: z.object({ label: z.string(), order: z.number().optional() }),
  /** Method-specific config (e.g. oauth providers, otp channel). */
  options: z.record(z.string(), z.unknown()).optional(),
})
export type AuthMethodDescriptor = z.infer<typeof authMethodDescriptorSchema>

export const authConfigSchema = z.object({
  backend: z.literal('supabase'),
  methods: z.array(authMethodDescriptorSchema).default([]),
  primaryMethods: z.array(z.string()).optional(),
  roles: z.object({
    source: z.enum(['db', 'claims']).default('db'),
    table: z.string().default('user_roles'),
  }),
  session: z
    .object({
      idleTimeoutMs: z.number().int().positive().optional(),
      warnBeforeMs: z.number().int().positive().optional(),
    })
    .optional(),
  tenancy: z
    .object({
      mode: z.enum(['single', 'per-country', 'global']),
    })
    .optional(),
})

export type AuthConfig = z.infer<typeof authConfigSchema>

/** Validate + normalize an app's auth config. Throws (zod) on an invalid shape. */
export function defineAuth(config: z.input<typeof authConfigSchema>): AuthConfig {
  return authConfigSchema.parse(config)
}
