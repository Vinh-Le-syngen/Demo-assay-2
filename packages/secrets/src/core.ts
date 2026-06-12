// @sys/secrets core — pure resolution over a SecretRefs manifest + an injected reader.
// Resolution order (first hit wins): keychain (via reader) → env → missing. resolveAll fails loud on
// a missing REQUIRED secret — never a silent empty string. The keychain side-effect lives in the
// injected reader (see ./keychain), so this module is pure + deterministic under test.
import { z } from 'zod'
import { createHash } from 'node:crypto'
import type {
  ResolveOptions,
  ResolveResult,
  SecretRef,
  SecretRefs,
  SnapshotEntry,
} from './types'

const secretRefBodySchema = z
  .object({
    env: z.string().optional(),
    keychain: z.string().optional(),
    required: z.boolean().optional(),
    description: z.string().optional(),
    provider: z.string().optional(),
    service: z.string().optional(),
    account: z.string().optional(),
  })
  .passthrough()

export const secretRefsSchema = z.object({
  apiVersion: z.string().optional(),
  kind: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  secrets: z.record(z.string(), secretRefBodySchema),
})

export type SecretRefsInput = z.input<typeof secretRefsSchema>

/** Validates a refs manifest. Throws (ZodError) on invalid input. */
export function defineRefs(refs: SecretRefs): SecretRefs {
  return secretRefsSchema.parse(refs) as SecretRefs
}

/** Normalise the `secrets` map into a flat, named array. */
export function listRefs(refs: SecretRefs): SecretRef[] {
  return Object.entries(refs.secrets).map(([name, body]) => ({ name, ...body }))
}

/**
 * The provider token for a secret name: the lowercased first underscore segment, with the cadre-os
 * fixup that any CLAUDE_* name maps to 'anthropic' (the Claude CLI is Anthropic's surface).
 */
export function providerOf(name: string): string {
  const head = name.split('_')[0] ?? name
  return head.toUpperCase() === 'CLAUDE' ? 'anthropic' : head.toLowerCase()
}

function serviceFor(ref: SecretRef, namespace: string): string {
  return ref.service ?? `com.${namespace}.${providerOf(ref.name)}`
}

function findRef(refs: SecretRefs, name: string): SecretRef {
  const body = refs.secrets[name]
  return { name, ...(body ?? {}) }
}

/**
 * Resolve one secret. keychain (reader) → env → missing. Never throws for a miss; the `source`
 * tells the caller what happened. `value` is present only for keychain/env hits.
 */
export function resolveSecret(name: string, refs: SecretRefs, opts: ResolveOptions = {}): ResolveResult {
  const ref = findRef(refs, name)
  const required = ref.required ?? true
  const namespace = opts.namespace ?? 'sys'
  const env = opts.env ?? (process.env as Record<string, string | undefined>)

  if (opts.reader && ref.provider !== 'env') {
    const service = serviceFor(ref, namespace)
    const account = ref.account ?? name
    let value: string | undefined
    try {
      value = opts.reader.read(service, account)
    } catch {
      value = undefined // a reader that throws is treated as a miss; env still gets a chance
    }
    if (value !== undefined && value !== '') return { name, source: 'keychain', required, value }
  }

  const envVal = env[name]
  if (envVal !== undefined && envVal !== '') return { name, source: 'env', required, value: envVal }

  return { name, source: 'missing', required }
}

/**
 * Resolve every ref to a { name: value } map. Throws (fail loud) listing the unresolved REQUIRED
 * secrets — callers never get a partial map that silently drops a required credential.
 */
export function resolveAll(refs: SecretRefs, opts: ResolveOptions = {}): Record<string, string> {
  const out: Record<string, string> = {}
  const missingRequired: string[] = []
  for (const { name } of listRefs(refs)) {
    const r = resolveSecret(name, refs, opts)
    if (r.value !== undefined) out[name] = r.value
    else if (r.required) missingRequired.push(name)
  }
  if (missingRequired.length > 0) {
    throw new Error(`@sys/secrets: unresolved required secret(s): ${missingRequired.join(', ')}`)
  }
  return out
}

/** Status of every ref WITHOUT exposing values — safe to log / surface in a deploy preflight. */
export function verifyRefs(refs: SecretRefs, opts: ResolveOptions = {}): ResolveResult[] {
  return listRefs(refs).map(({ name }) => {
    const r = resolveSecret(name, refs, opts)
    return { name: r.name, source: r.source, required: r.required }
  })
}

const REF_RE = /\$\{([A-Z0-9_]+)\}/g

/**
 * Substitute every `${REF}` in a string with its resolved value. An unresolved ref is left as-is
 * unless `strict`, in which case it throws (fail loud for required config).
 */
export function expand(
  input: string,
  refs: SecretRefs,
  opts: ResolveOptions & { strict?: boolean } = {},
): string {
  return input.replace(REF_RE, (whole, name: string) => {
    const r = resolveSecret(name, refs, opts)
    if (r.value !== undefined) return r.value
    if (opts.strict) throw new Error(`@sys/secrets: cannot expand unresolved \${${name}}`)
    return whole
  })
}

/** 'sha256:…' fingerprint of a value, for change detection. */
export function fingerprint(value: string): string {
  return 'sha256:' + createHash('sha256').update(value).digest('hex')
}

/**
 * A snapshot-safe entry for a secret: its name, a ref descriptor, and a fingerprint of the resolved
 * value (or null if unresolved). NEVER contains the value — safe to write to compiled config.
 */
export function snapshotEntry(name: string, refs: SecretRefs, opts: ResolveOptions = {}): SnapshotEntry {
  const ref = findRef(refs, name)
  const namespace = opts.namespace ?? 'sys'
  const descriptor =
    ref.provider === 'env'
      ? `env:${name}`
      : `keychain:${serviceFor(ref, namespace)}/${ref.account ?? name}`
  const r = resolveSecret(name, refs, opts)
  return { name, ref: descriptor, fingerprint: r.value !== undefined ? fingerprint(r.value) : null }
}
