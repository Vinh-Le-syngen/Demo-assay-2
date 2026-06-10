import { describe, it, expect } from 'vitest'
import { defineAuth } from '../core/config'

describe('defineAuth', () => {
  it('normalizes a minimal config with defaults', () => {
    const cfg = defineAuth({ backend: 'supabase', roles: {} })
    expect(cfg.methods).toEqual([])
    expect(cfg.roles.source).toBe('db')
    expect(cfg.roles.table).toBe('user_roles')
  })

  it('accepts method descriptors and tenancy', () => {
    const cfg = defineAuth({
      backend: 'supabase',
      methods: [{ id: 'oauth', capability: 'oauth', ui: { label: 'Google', order: 1 } }],
      roles: { source: 'db', table: 'user_roles' },
      tenancy: { mode: 'per-country' },
    })
    expect(cfg.methods[0]?.id).toBe('oauth')
    expect(cfg.tenancy?.mode).toBe('per-country')
  })

  it('rejects an unknown backend', () => {
    // @ts-expect-error invalid backend
    expect(() => defineAuth({ backend: 'firebase', roles: {} })).toThrow()
  })

  it('rejects an invalid method id', () => {
    expect(() =>
      defineAuth({
        backend: 'supabase',
        // @ts-expect-error invalid method id
        methods: [{ id: 'telepathy', capability: 'x', ui: { label: 'X' } }],
        roles: {},
      }),
    ).toThrow()
  })
})
