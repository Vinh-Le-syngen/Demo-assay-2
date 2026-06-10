// @eng/governance — composition root. Takes a venture's governance config (validated via @sys/canon
// schemas) and exposes the decision surface. The engine reads records + policy; it owns no truth.

import {
  RestrictedClaimsConfig,
  ApprovedClaimsConfig,
  CapabilityInventoryConfig,
  ChoicesConfig,
  ServiceAuthorityConfig,
  type RestrictedClaim,
  type ApprovedClaim,
  type Capability,
} from '@sys/canon'
import {
  scanClaims,
  linkClaims,
  commerciallySellable,
  unresolvedServiceAuthority,
  type ContentFile,
  type ClaimViolation,
  type ClaimLinkIssue,
  type ScanOptions,
} from './decide'

export type GovernanceConfig = {
  restricted?: unknown
  approved?: unknown
  capabilities?: unknown
  choices?: unknown
  serviceAuthority?: unknown
  scanExclude?: RegExp
}

export type Governance = {
  restricted: RestrictedClaim[]
  approved: ApprovedClaim[]
  capabilities: Capability[]
  scan(files: ContentFile[], opts?: ScanOptions): ClaimViolation[]
  linkClaims(): ClaimLinkIssue[]
  unresolvedServiceAuthority(): string[]
  sellableServices(): string[]
}

/** defineGovernance — validates the injected config and returns the decision surface. */
export function defineGovernance(config: GovernanceConfig = {}): Governance {
  const restricted = config.restricted !== undefined ? RestrictedClaimsConfig.parse(config.restricted).restricted : []
  const approved = config.approved !== undefined ? ApprovedClaimsConfig.parse(config.approved).claims : []
  const capabilities = config.capabilities !== undefined ? CapabilityInventoryConfig.parse(config.capabilities).capabilities : []
  if (config.choices !== undefined) ChoicesConfig.parse(config.choices)
  const services = config.serviceAuthority !== undefined ? ServiceAuthorityConfig.parse(config.serviceAuthority).services : {}
  const exclude = config.scanExclude

  return {
    restricted,
    approved,
    capabilities,
    scan: (files, opts) => scanClaims(files, restricted, { ...(exclude ? { exclude } : {}), ...opts }),
    linkClaims: () => linkClaims(approved, capabilities),
    unresolvedServiceAuthority: () => unresolvedServiceAuthority(services),
    sellableServices: () => Object.entries(services).filter(([, v]) => commerciallySellable(v)).map(([k]) => k),
  }
}
