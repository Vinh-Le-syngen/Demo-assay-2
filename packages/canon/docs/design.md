# @sys/canon — design

## Problem
Every venture needs the same governance machinery — a canon (source of truth), machine-checkable
registries, and gates that stop drift (claim drift, service-scope drift, strategy drift). Re-inventing
this per venture means each one re-derives its own structure and its own enforcement, inconsistently.

## Approach (the @sys contract)
`@sys/canon` is the **generic engine + injected specifics** pattern (CONVENTIONS §"Configurability"):
- The **schemas** are the cross-language contract. Qarar (TS) imports them; cadre-os (Python/bash) validates
  the same shapes via the CLI / a JSON-Schema export (roadmap).
- The **gates are pure functions** (`scanClaims`, `validate`, `unresolvedServiceAuthority`) — no IO, fully
  testable, like `@sys/gatekeeper`'s `promotionVerdict`.
- The **CLI** (`sys-canon`) is the thin IO shell (load YAML, walk files) so non-TS runtimes can use it.

## What's a "framework" vs the engine
| Engine (@sys/canon) | Venture config (e.g. Qarar `docs/`) |
|---|---|
| schemas: choices, claims, service-authority | the actual values (Qarar's bet, claims, services) |
| `scanClaims` gate + default legal-exclude | which paths to scan |
| `defineCanon()` composition root | the parsed registries passed in |
| CLI runners | CI wiring, the canon prose (.md) |

## Planes
Primary **governance** (the stable contract + policy). Secondary **control** (CLI decision entry). Data is
injected (the caller reads files); Observability = the violation list it returns; Recovery = the consumer's
"fix the copy / freeze the claim" response.

## Non-goals
- Not a CMS or a docs generator. It governs config + claims; the prose canons live in the venture.
- Does not read the network or own a database. Pure core + a thin CLI.
