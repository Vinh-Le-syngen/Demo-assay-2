import { z } from 'zod'
import { createVault, type VaultDeps } from './core/service'
import type { Vault } from './core/contract'

export const vaultConfigSchema = z.object({})

export function defineVault(deps: VaultDeps): Vault {
  vaultConfigSchema.parse({})
  return createVault(deps)
}
