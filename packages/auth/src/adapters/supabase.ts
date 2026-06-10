// @sys/auth/adapters/supabase — the Data-plane backend implementation.
// Verification + role resolution + a request-scoped (RLS-respecting) client.
// @supabase/supabase-js is an optional peer dependency (only needed for this adapter).

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { ResolvedRole, RoleResolver } from '../core/contract'

export { createSupabaseVerifier } from '../server/verify'
export type { SupabaseVerifyConfig } from '../server/verify'

export type SupabaseRoleResolverConfig = {
  supabaseUrl: string
  /** Service-role key. Used ONLY for the role lookup; bypasses RLS. */
  serviceRoleKey: string
  /** Role table. Default: 'user_roles'. */
  table?: string
  /** Governance seam: map a role to its permissions (the app's permission model). */
  permissionsFor: (role: string) => string[]
}

/** Resolve a user's authoritative role from the database (service-role read). */
export function createSupabaseRoleResolver(cfg: SupabaseRoleResolverConfig): RoleResolver {
  const admin: SupabaseClient = createClient(cfg.supabaseUrl, cfg.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const table = cfg.table ?? 'user_roles'

  return {
    async resolve(userId: string): Promise<ResolvedRole | null> {
      const { data, error } = await admin
        .from(table)
        .select('role')
        .eq('user_id', userId)
        .maybeSingle()

      const role = (data as { role?: unknown } | null)?.role
      if (error || typeof role !== 'string' || role.length === 0) return null
      return { role, permissions: cfg.permissionsFor(role), source: 'db' }
    },
  }
}

/**
 * Request-scoped client bound to a verified user's JWT — respects RLS. Construct one
 * PER REQUEST; never share a module-scoped instance (warm-runtime session leakage).
 */
export function createUserClient(
  supabaseUrl: string,
  anonKey: string,
  jwt: string,
): SupabaseClient {
  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
