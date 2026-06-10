# Changelog — @eng/governance

## 1.0.0

Promoted to `1.0.0` on adopting Changesets + real SemVer (2026-06-08). Depends on
`@sys/canon` (`workspace:*`, rewritten to a real range in the packed artifact). No API change
— a versioning-policy promotion. Distribution: **vendored-only** (`@eng/*` is not
registry-published; see `DISTRIBUTION.md`). Captured in the `baseline@2026.06.0` release set.

## 0.0.1

Initial extraction from Qarar (2026-06-03). Control-plane governance engine: pure deciders (claim scan, claim→capability, service readiness, SEO gates) computing decisions from @sys/canon records + injected policy. Owns no canonical truth.
