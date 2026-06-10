// @sys/consent — cookie / script consent. The category vocabulary + a PURE decision engine
// ("may this technology run in this context?") + the consent-decision contract + the record /
// store / event-sink SEAMS (interfaces the host implements — own-the-domain, inject the IO, the
// @sys/vault pattern). No DB, no cookies, no UI in this package.
//
// Invariants: strictly_necessary always runs; no decision or a STALE one (policy/registry version
// moved) → necessary-only (safe default); a non-essential category runs only when explicitly granted.

export type ConsentCategory =
  | 'strictly_necessary'
  | 'preferences'
  | 'analytics'
  | 'marketing'
  | 'support'

export type CategoryChoice = 'granted' | 'denied'

export interface ConsentCategoryInfo {
  id: ConsentCategory
  label: string
  description: string
  /** Strictly necessary categories are always on and cannot be toggled off. */
  essential: boolean
}

/** Universal category vocabulary. Hosts may relabel via their own copy; the ids are the contract. */
export const CONSENT_CATEGORIES: readonly ConsentCategoryInfo[] = [
  {
    id: 'strictly_necessary',
    label: 'Strictly necessary',
    description:
      'Required for sign-in, security, checkout, load balancing, fraud prevention, and remembering your cookie choice. Always on.',
    essential: true,
  },
  {
    id: 'preferences',
    label: 'Preferences',
    description: 'Remember choices like language and display so the site works the way you set it.',
    essential: false,
  },
  {
    id: 'analytics',
    label: 'Analytics',
    description: 'Help understand how the site is used so it can be improved. Aggregated — not used to identify you.',
    essential: false,
  },
  {
    id: 'marketing',
    label: 'Marketing',
    description: 'Measure campaigns and referrals.',
    essential: false,
  },
  {
    id: 'support',
    label: 'Support tools',
    description: 'In-page live chat and support widgets that may load third-party tools.',
    essential: false,
  },
]

export const ALL_CONSENT_CATEGORIES: readonly ConsentCategory[] = CONSENT_CATEGORIES.map((c) => c.id)
export const NON_ESSENTIAL_CATEGORIES: readonly ConsentCategory[] = CONSENT_CATEGORIES.filter(
  (c) => !c.essential,
).map((c) => c.id)

/**
 * A declared piece of non-essential browser technology — a governance artifact, not a memory game.
 * Required fields identify it; the optional governance fields make vendor review auditable. The host
 * owns the concrete registry (vendors are host-specific).
 */
export interface ConsentVendor {
  id: string
  name: string
  category: ConsentCategory
  purpose: string
  /** Required vendors load regardless of choice (strictly necessary / operational). */
  required: boolean
  // ── Governance fields ──────────────────────────────────────────────────────
  /** Personal data the vendor may receive. */
  dataCollected?: string[]
  /** Cookie names it sets. */
  cookies?: string[]
  /** Domains it calls. */
  domains?: string[]
  /** Countries it is enabled in. Empty/undefined = all enabled countries. */
  countries?: string[]
  /** Does it run BEFORE a choice? Must be false unless `required`. */
  runsPreConsent?: boolean
  /** Human-readable retention statement. */
  retention?: string
  /** Link to the vendor's DPA / terms. */
  dpaUrl?: string
  /** Internal owner (team or person) responsible for it. */
  owner?: string
  /** Whether it can be disabled at runtime (kill switch). */
  killSwitch?: boolean
  /** ISO date it was last reviewed. */
  reviewedAt?: string
}

export interface ConsentDecision {
  policyVersion: string
  registryVersion: string
  categories: Record<ConsentCategory, CategoryChoice>
  /** ISO timestamp of when the subject chose. */
  decidedAt: string
}

export interface ConsentContext {
  /** The subject's stored decision, or null if they haven't chosen yet. */
  decision: ConsentDecision | null
  /** The CURRENT policy + registry versions to compare the stored decision against. */
  policyVersion: string
  registryVersion: string
}

// ── Decision engine (pure) ────────────────────────────────────────────────────

/** True when there is no decision, or the stored decision predates the current policy/registry. */
export function requiresReprompt(ctx: ConsentContext): boolean {
  if (!ctx.decision) return true
  return (
    ctx.decision.policyVersion !== ctx.policyVersion ||
    ctx.decision.registryVersion !== ctx.registryVersion
  )
}

/** May technology in `category` run in this context? Safe default: necessary-only. */
export function canUse(category: ConsentCategory, ctx: ConsentContext): boolean {
  if (category === 'strictly_necessary') return true
  if (requiresReprompt(ctx)) return false
  return ctx.decision!.categories[category] === 'granted'
}

/** May this vendor load? Required vendors always may; others follow their category (+ country). */
export function canLoadVendor(
  vendor: Pick<ConsentVendor, 'category' | 'required' | 'countries'>,
  ctx: ConsentContext,
  country?: string,
): boolean {
  if (vendor.countries && country && !vendor.countries.includes(country)) return false
  if (vendor.required) return true
  return canUse(vendor.category, ctx)
}

/**
 * Build a full categories map. Essential categories are always granted; every other category is
 * granted iff present in `grantedNonEssential`. Pure — the caller passes the category universe.
 */
export function buildCategories(
  allCategories: readonly ConsentCategory[],
  grantedNonEssential: readonly ConsentCategory[],
): Record<ConsentCategory, CategoryChoice> {
  const granted = new Set(grantedNonEssential)
  const out = {} as Record<ConsentCategory, CategoryChoice>
  for (const c of allCategories) {
    out[c] = c === 'strictly_necessary' || granted.has(c) ? 'granted' : 'denied'
  }
  return out
}

// ── System-of-record + observability SEAMS (host implements; package stays pure) ──────────────

export type ConsentSource = 'banner' | 'preferences' | 'account_settings' | 'import'

/** A persisted consent decision — the auditable record. Anonymous first, linked to a subject on login. */
export interface ConsentRecord {
  subjectId: string | null
  anonymousId: string
  policyVersion: string
  registryVersion: string
  categories: Record<ConsentCategory, CategoryChoice>
  source: ConsentSource
  country?: string
  userAgent?: string
  ip?: string
  createdAt: string
}

/** Host-implemented persistence (e.g. Supabase). The package owns the contract, not the IO. */
export interface ConsentStore {
  save(record: ConsentRecord): Promise<void>
  /** Most recent record for an anonymous id and/or subject. */
  latest(query: { anonymousId?: string; subjectId?: string }): Promise<ConsentRecord | null>
  /** Attach an anonymous id's records to a subject (on login). */
  link(anonymousId: string, subjectId: string): Promise<void>
}

export type ConsentEventType =
  | 'banner_shown'
  | 'accepted_all'
  | 'rejected_non_essential'
  | 'custom_saved'
  | 'changed'
  | 'vendor_blocked'
  | 'reprompt'

export interface ConsentEvent {
  type: ConsentEventType
  anonymousId: string
  subjectId?: string | null
  policyVersion: string
  registryVersion: string
  at: string
  detail?: Record<string, unknown>
}

/** Host-implemented sink (structured logs now, @sys/sentinel later). Never decides; only records. */
export interface ConsentEventSink {
  emit(event: ConsentEvent): void
}
