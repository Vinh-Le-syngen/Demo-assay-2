import { z } from 'zod'
import { createVault, type VaultDeps, type Vault } from './core/service'

export const vaultConfigSchema = z.object({})

export function defineVault(deps: VaultDeps): Vault {
  vaultConfigSchema.parse({})
  return createVault(deps)
}
