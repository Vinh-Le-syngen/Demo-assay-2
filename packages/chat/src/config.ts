// @sys/chat — config (the composition root). Isomorphic, zod-validated, secrets-free.
// A consumer supplies its own turn policy, max turns, and optional content-policy seam.
// The package owns Control (session lifecycle); Governance (content filtering) is injected.

import { z } from 'zod'

/** Turn-ordering policy vocabulary. */
export const TURN_POLICIES = [
  'strict-alternation',  // user → assistant → user → … (no consecutive same-role)
  'free-form',           // any role may follow any role
] as const

export const turnPolicyEnum = z.enum(TURN_POLICIES)
export type TurnPolicy = (typeof TURN_POLICIES)[number]

/**
 * Content-policy verdict — the host's filter returns one of these.
 * - `allow`: message passes through unmodified.
 * - `deny`: message is blocked entirely (not added to the session).
 * - `redact`: message is added with `content` replaced by the redacted version.
 */
export const CONTENT_VERDICTS = ['allow', 'deny', 'redact'] as const
export type ContentVerdict = (typeof CONTENT_VERDICTS)[number]

/** The injected content-policy seam — the host supplies its own moderation logic. */
export type ContentPolicy = {
  filter(message: { role: string; content: string }): {
    verdict: ContentVerdict
    /** Replacement content when verdict is 'redact'. */
    redacted?: string
    /** Optional reason (for observability / audit). */
    reason?: string
  }
}

/** A permissive default — allows everything. The host replaces this with real moderation. */
const DEFAULT_CONTENT_POLICY: ContentPolicy = {
  filter: () => ({ verdict: 'allow' }),
}

export const chatConfigSchema = z.object({
  /** Maximum messages in a session before it auto-closes. */
  maxTurns: z.number().int().min(1).max(10_000).default(200),
  /** Turn-ordering policy. */
  turnPolicy: turnPolicyEnum.default('strict-alternation'),
})

export type ChatConfigInput = z.input<typeof chatConfigSchema>
export type ChatConfig = z.infer<typeof chatConfigSchema> & {
  /** The injected content-policy seam (not in the Zod schema — it's a function, not serialisable). */
  contentPolicy: ContentPolicy
}

/**
 * Composition root. Validates + normalises the config object.
 * The optional `contentPolicy` seam is accepted alongside the Zod-validated fields.
 */
export function defineChat(
  input: ChatConfigInput & { contentPolicy?: ContentPolicy },
): ChatConfig {
  const parsed = chatConfigSchema.parse(input)
  return {
    ...parsed,
    contentPolicy: input.contentPolicy ?? DEFAULT_CONTENT_POLICY,
  }
}
