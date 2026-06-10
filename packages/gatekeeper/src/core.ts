// @sys/gatekeeper core — the promotion gate (Governance). A single pure function turns the
// facts about a proposed branch promotion (is it an allowed edge? tests green? gates clean?
// how risky? human-approved?) into an ALLOW / DENY / REVIEW verdict with reasons. Extracted
// from cadre-os SYS-GATEKEEPER's promotion role (promote-staging.sh, ADR-0037): "ff-merge
// staging → main when gates green; Normal auto-promotes, Risky/Critical hold for a human."
//
// It does NOT run tests or git itself — the caller supplies the facts (e.g. testsGreen from CI,
// gateViolations from @sys/checkpoint). Keeping it pure makes the policy auditable and testable.

export type Risk = 'normal' | 'risky' | 'critical'

export type PromotionInput = {
  /** Source branch (e.g. 'staging', 'feat/x'). */
  from: string
  /** Target branch being promoted to (e.g. 'main', 'staging'). */
  to: string
  /** CI verdict — are the required tests green? */
  testsGreen: boolean
  /** Outstanding policy-gate violations (e.g. @sys/checkpoint runCheckpoint, flattened). */
  gateViolations?: string[]
  /** Change risk; drives the human-hold decision. Default 'normal'. */
  risk?: Risk
  /** Whether an explicit human approval has been supplied for this promotion. */
  humanApproved?: boolean
}

/** A promotion edge `from → to`. `from` may be '*' (any) or a 'prefix/*' wildcard; `to` is exact. */
export type PromotionEdge = { from: string; to: string }

export type PromotionPolicy = {
  /** Allowed promotion edges. Omit to allow any edge (the edge check is skipped). */
  edges?: PromotionEdge[]
  /** Targets that always require human approval (e.g. ['main']). */
  humanApprovalFor?: string[]
  /** Risk levels that require human approval. Default ['risky', 'critical']. */
  reviewRisk?: Risk[]
}

export type Decision = 'ALLOW' | 'DENY' | 'REVIEW'

export type PromotionVerdict = {
  decision: Decision
  reasons: string[]
}

/** Match a branch name against an edge pattern: '*' = any, 'pre/*' = prefix, else exact. */
function matchPattern(pattern: string, branch: string): boolean {
  if (pattern === '*') return true
  if (pattern.endsWith('/*')) return branch.startsWith(pattern.slice(0, -1))
  return pattern === branch
}

function edgeAllowed(policy: PromotionPolicy, from: string, to: string): boolean {
  if (!policy.edges) return true
  return policy.edges.some((e) => matchPattern(e.from, from) && e.to === to)
}

/**
 * Decide whether a promotion may proceed.
 *
 * Order of precedence:
 *   1. DENY — any hard blocker: tests not green, outstanding gate violations, or a
 *      from→to edge the policy doesn't allow. (All blockers are reported, not just the first.)
 *   2. REVIEW — no blockers, but the target requires human approval (policy.humanApprovalFor)
 *      or the risk is in policy.reviewRisk, and no humanApproved flag was supplied.
 *   3. ALLOW — otherwise.
 */
export function promotionVerdict(
  input: PromotionInput,
  policy: PromotionPolicy = {},
): PromotionVerdict {
  const reviewRisk = new Set<Risk>(policy.reviewRisk ?? ['risky', 'critical'])
  const risk: Risk = input.risk ?? 'normal'

  // 1. Hard blockers → DENY.
  const denials: string[] = []
  if (!input.testsGreen) denials.push('tests are not green')
  const violations = input.gateViolations ?? []
  if (violations.length) denials.push(`${violations.length} gate violation(s): ${violations.join('; ')}`)
  if (!edgeAllowed(policy, input.from, input.to)) {
    denials.push(`promotion '${input.from}' → '${input.to}' is not an allowed edge`)
  }
  if (denials.length) return { decision: 'DENY', reasons: denials }

  // 2. Human-hold → REVIEW (unless already approved).
  if (!input.humanApproved) {
    const reviews: string[] = []
    if ((policy.humanApprovalFor ?? []).includes(input.to)) {
      reviews.push(`target '${input.to}' requires human approval`)
    }
    if (reviewRisk.has(risk)) {
      reviews.push(`risk '${risk}' requires human approval`)
    }
    if (reviews.length) return { decision: 'REVIEW', reasons: reviews }
  }

  // 3. Clear.
  const note = input.humanApproved ? 'all checks pass (human-approved)' : 'all checks pass'
  return { decision: 'ALLOW', reasons: [note] }
}

/**
 * The canonical staging-first policy: anything → staging is allowed; staging → main is the only
 * route to production; production always needs human approval; risky/critical hold for a human.
 * Encodes Qarar's "feature → staging → main, only a human promotes to main" rule.
 */
export function stagingFirstPolicy(
  opts: { production?: string; staging?: string } = {},
): PromotionPolicy {
  const production = opts.production ?? 'main'
  const staging = opts.staging ?? 'staging'
  return {
    edges: [
      { from: '*', to: staging },
      { from: staging, to: production },
    ],
    humanApprovalFor: [production],
    reviewRisk: ['risky', 'critical'],
  }
}
