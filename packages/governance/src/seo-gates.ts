// @eng/governance — SEO gates (Control). Pure decisions over @sys/canon SEO records.

import type { PageEntry, SeoRulesConfig, Severity } from '@sys/canon'

export type SeoIssue = { gate: string; path?: string; detail: string; severity: Severity }

/** Page-authority: every indexable path that ships must be registered. */
export function pageAuthorityGate(indexablePaths: string[], pages: PageEntry[]): SeoIssue[] {
  const known = new Set(pages.map((p) => p.path))
  return indexablePaths
    .filter((p) => !known.has(p))
    .map((p) => ({ gate: 'page-authority', path: p, detail: 'indexable page not in page-registry', severity: 'high' as const }))
}

/** Cannibalization: one keyword may have only one canonical target page. */
export function cannibalizationGate(pages: PageEntry[]): SeoIssue[] {
  const byKeyword = new Map<string, string[]>()
  for (const p of pages) {
    if (!p.canonical) continue
    for (const kw of p.target_keywords) {
      const arr = byKeyword.get(kw) ?? []
      arr.push(p.path)
      byKeyword.set(kw, arr)
    }
  }
  const issues: SeoIssue[] = []
  for (const [kw, paths] of byKeyword) {
    if (paths.length > 1) issues.push({ gate: 'cannibalization', detail: `keyword "${kw}" has ${paths.length} canonical targets: ${paths.join(', ')}`, severity: 'medium' })
  }
  return issues
}

/** Noindex: draft/provisional pages (or VERIFY-status rows) must NOT be indexable. */
export function noindexGate(pages: PageEntry[]): SeoIssue[] {
  return pages
    .filter((p) => p.indexable && (p.launch_status !== 'live' || p.status === 'verify' || p.status === 'provisional'))
    .map((p) => ({ gate: 'noindex', path: p.path, detail: `non-live page (${p.launch_status}/${p.status}) is indexable — must be noindex`, severity: 'high' as const }))
}

/** Freshness: regulated/commercial pages need a recent last_reviewed. `now` injected to stay pure. */
export function freshnessGate(pages: PageEntry[], opts: { now: number; maxAgeDays?: number }): SeoIssue[] {
  const maxAgeMs = (opts.maxAgeDays ?? 180) * 86_400_000
  const regulated = new Set(['service', 'comparison'])
  const issues: SeoIssue[] = []
  for (const p of pages) {
    if (!regulated.has(p.page_type)) continue
    if (!p.last_reviewed) {
      issues.push({ gate: 'freshness', path: p.path, detail: 'regulated page missing last_reviewed', severity: 'medium' })
      continue
    }
    const ts = Date.parse(p.last_reviewed)
    if (Number.isNaN(ts) || opts.now - ts > maxAgeMs) {
      issues.push({ gate: 'freshness', path: p.path, detail: `last_reviewed stale (> ${opts.maxAgeDays ?? 180}d)`, severity: 'medium' })
    }
  }
  return issues
}

export type PageMeta = { path: string; title?: string; description?: string; fields?: Record<string, unknown> }

export function seoRulesGate(meta: PageMeta, rules: SeoRulesConfig): SeoIssue[] {
  const issues: SeoIssue[] = []
  if (meta.title && meta.title.length > rules.title_max_chars) issues.push({ gate: 'seo-rules', path: meta.path, detail: `title ${meta.title.length} > ${rules.title_max_chars}`, severity: 'medium' })
  if (meta.description && meta.description.length > rules.description_max_chars) issues.push({ gate: 'seo-rules', path: meta.path, detail: `description ${meta.description.length} > ${rules.description_max_chars}`, severity: 'medium' })
  const hay = `${meta.title ?? ''} ${meta.description ?? ''}`.toLowerCase()
  for (const pat of rules.forbidden_patterns) {
    if (pat && hay.includes(pat.toLowerCase())) issues.push({ gate: 'seo-rules', path: meta.path, detail: `forbidden pattern "${pat}"`, severity: 'high' })
  }
  for (const field of rules.required_fields) {
    if (!meta.fields || meta.fields[field] === undefined || meta.fields[field] === null || meta.fields[field] === '') {
      issues.push({ gate: 'seo-rules', path: meta.path, detail: `missing required field "${field}"`, severity: 'medium' })
    }
  }
  return issues
}
