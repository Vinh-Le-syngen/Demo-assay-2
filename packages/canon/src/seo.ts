// @sys/canon — SEO governance RECORDS (schemas only). The gates live in @eng/governance.
// SEO is a demand-capture system bounded by strategy → envelope → positioning → product/service-authority;
// these schemas make its registries machine-checkable. A venture supplies its own keyword-map / pages / rules.

import { z } from 'zod'
import { provenanceFields } from './core'

export const SearchIntent = z.enum(['transactional', 'commercial', 'informational', 'navigational'])
export const Priority = z.enum(['high', 'medium', 'low'])

export const KeywordEntry = z.object({
  ...provenanceFields,
  keyword: z.string().min(1),
  intent: SearchIntent.default('informational'),
  priority: Priority.default('medium'),
  target_page: z.string(),
  governed_by: z
    .object({
      strategy_choice: z.string().optional(),
      service_authority: z.string().optional(),
      claim_set: z.string().optional(),
    })
    .default({}),
})
export type KeywordEntry = z.infer<typeof KeywordEntry>

export const KeywordMapConfig = z.object({
  version: z.number().default(1),
  keywords: z.array(KeywordEntry).default([]),
})
export type KeywordMapConfig = z.infer<typeof KeywordMapConfig>

export const PageEntry = z.object({
  ...provenanceFields,
  path: z.string().min(1),
  page_type: z.enum(['home', 'service', 'comparison', 'kb', 'landing', 'legal', 'other']).default('other'),
  canonical: z.boolean().default(true),
  indexable: z.boolean().default(true),
  target_keywords: z.array(z.string()).default([]),
  required_claims: z.array(z.string()).default([]),
  required_capabilities: z.array(z.string()).default([]),
  launch_status: z.enum(['draft', 'provisional', 'live']).default('draft'),
})
export type PageEntry = z.infer<typeof PageEntry>

export const PageRegistryConfig = z.object({
  version: z.number().default(1),
  pages: z.array(PageEntry).default([]),
})
export type PageRegistryConfig = z.infer<typeof PageRegistryConfig>

export const SeoRulesConfig = z.object({
  version: z.number().default(1),
  title_max_chars: z.number().default(60),
  description_max_chars: z.number().default(155),
  forbidden_patterns: z.array(z.string()).default([]),
  required_fields: z.array(z.string()).default([]),
})
export type SeoRulesConfig = z.infer<typeof SeoRulesConfig>

export const seoSchemas = {
  keywordMap: KeywordMapConfig,
  pageRegistry: PageRegistryConfig,
  seoRules: SeoRulesConfig,
} as const
export type SeoSchemaName = keyof typeof seoSchemas
export function validateSeo(name: SeoSchemaName, obj: unknown) {
  return seoSchemas[name].safeParse(obj)
}
