// @sys/secrets types — secret REFERENCES live in code; secret VALUES never do.
// A ref names where a value comes from (Keychain service/account, or an env var). The resolver
// materialises it at runtime. Generic + host-agnostic: the namespace + the actual values are the host's.

/** Where a secret's value is sourced from. Extensible; `keychain` and `env` are built in. */
export type Provider = 'keychain' | 'env' | (string & {})

/** One secret reference (no value). Service/account are optional — derived by convention when absent. */
export interface SecretRef {
  /** The env-style name callers ask for, e.g. 'SUPABASE_SERVICE_ROLE_KEY'. */
  name: string
  provider?: Provider
  /** Keychain service, e.g. 'com.qarar.supabase'. Default: `com.<namespace>.<provider-of-name>`. */
  service?: string
  /** Keychain account. Default: the secret name. */
  account?: string
  /** When true, resolveAll throws if this one is unresolved (fail loud). Default true. */
  required?: boolean
}

/** A SecretRefs manifest (mirrors cadre-os config/secrets/refs.yaml). `secrets` is name → ref body. */
export interface SecretRefs {
  apiVersion?: string
  kind?: 'SecretRefs'
  metadata?: Record<string, unknown>
  secrets: Record<string, Omit<SecretRef, 'name'>>
}

/** Reads a value from a backing store (e.g. the macOS Keychain). Injected so the core stays pure. */
export interface SecretReader {
  /** Return the stored value, or undefined if absent. MUST NOT throw for a miss. */
  read(service: string, account: string): string | undefined
}

export interface ResolveOptions {
  /** Keychain (or other) reader. Absent ⇒ keychain step skipped (env-only). */
  reader?: SecretReader
  /** Environment to fall back to. Default: process.env. */
  env?: Record<string, string | undefined>
  /** Namespace for derived keychain service names (`com.<namespace>.<provider>`). Default 'sys'. */
  namespace?: string
}

export type ResolveSource = 'keychain' | 'env' | 'missing'

/** The outcome of resolving one ref. `value` is omitted for `missing` (and in verify output). */
export interface ResolveResult {
  name: string
  source: ResolveSource
  required: boolean
  value?: string
}

/** A snapshot-safe descriptor: identifies a secret + detects change, WITHOUT carrying the value. */
export interface SnapshotEntry {
  name: string
  ref: string
  /** 'sha256:…' of the value, or null when the secret is unresolved. */
  fingerprint: string | null
}
