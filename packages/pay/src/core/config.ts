// @sys/pay — composition root. `definePay` validates the per-country/entity config.
// Structural fact encoded here: each country = its own legal entity + provider account +
// bank account in the local currency. presentment = settlement = that currency (no FX).

import { z } from 'zod'
import type { FulfilmentTrigger } from './machine'

const methodSchema = z.enum([
  'card',
  'apple_pay',
  'google_pay',
  'paynow',
  'bizum',
  'sepa_debit',
  'momo',
  'zalopay',
  'vnpay',
])

const countrySchema = z.object({
  /** Per-country legal entity (seller / merchant of record in its jurisdiction). */
  entity: z.string().min(1),
  /** ISO-4217. The entity settles in this currency; charges MUST match it (no FX). */
  currency: z.string().regex(/^[A-Z]{3}$/, 'currency must be a 3-letter ISO-4217 code'),
  /** `<providerId>:<account>` e.g. 'stripe:acct_ae'. account = the entity's sub-account. */
  provider: z.string().regex(/^[a-z0-9_]+(:[A-Za-z0-9_]+)?$/, 'provider must be "<id>" or "<id>:<account>"'),
  methods: z.array(methodSchema).min(1),
  sca: z.literal('required').optional(),
})

const fulfilmentSchema = z.object({
  startsOn: z.enum(['authorized', 'captured', 'settled']).default('captured'),
})

export const payConfigSchema = z.object({
  countries: z.record(
    z.string().regex(/^[A-Z]{2}$/, 'country must be ISO-3166-1 alpha-2'),
    countrySchema,
  ),
  fulfilment: fulfilmentSchema.default({ startsOn: 'captured' }),
})

export type CountryConfig = z.infer<typeof countrySchema>
export type PaymentMethodName = z.infer<typeof methodSchema>
export type PayConfig = z.infer<typeof payConfigSchema>

export function definePay(input: unknown): PayConfig {
  return payConfigSchema.parse(input)
}

export function resolveCountry(config: PayConfig, country: string): CountryConfig {
  const c = config.countries[country]
  if (!c) throw new Error(`@sys/pay: no payment config for country "${country}"`)
  return c
}

/** Split 'stripe:acct_ae' → { id: 'stripe', account: 'acct_ae' }. */
export function parseProvider(provider: string): { id: string; account?: string } {
  const [id = provider, account] = provider.split(':')
  return { id, account }
}

export function fulfilmentTrigger(config: PayConfig): FulfilmentTrigger {
  return config.fulfilment.startsOn
}
