// @sys/release — public API (pure core). The node host is a separate entry
// (`@sys/release/node-host`) so the root export stays isomorphic and side-effect-free.

export type {
  SchemaVersion,
  Severity,
  ReleaseFinding,
  EvidenceRef,
  ReleaseStatus,
  ReleaseSet,
  AdoptionMode,
  AdoptionRecord,
  WorkspacePackage,
  DecisionKind,
  ReleaseSubject,
  ReleaseDecision,
} from './types'
export type { ReleaseHost, TarballManifest } from './host'
export type { CreateReleaseSetArgs, ValidateReleaseSetArgs } from './release-set'
export type { ProductManifest, ValidateAdoptionArgs } from './adoption'
export type { DecideArgs } from './decide'

export { discoverWorkspacePackages } from './workspace'
export { createReleaseSet, validateReleaseSet } from './release-set'
export { validateAdoption, discoverConsumerManifests } from './adoption'
export { decide } from './decide'
export {
  releaseSetSchema,
  adoptionRecordSchema,
  parseReleaseSet,
  parseAdoptionRecord,
} from './schemas'
export * from './config'
