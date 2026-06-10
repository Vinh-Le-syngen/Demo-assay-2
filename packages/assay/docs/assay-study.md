# `@sys/assay` Study: Testing & Quality Gates

## 1. Domain Context: The Testing Taxonomy
To ensure continuous quality and prevent regressions, our architecture enforces a strict testing taxonomy. Tests are classified into distinct layers to balance speed, isolation, and confidence:
- **Unit Testing**: Tests individual, isolated functions. Example: `@sys/assay` tests its own audit engine using a `memHost` (an in-memory mock file system) to run lightning-fast validations without touching the actual hard drive.
- **Integration Testing**: Tests how two or more units work together.
- **End-to-End (E2E) Testing**: Tests the entire system from the user's perspective.
- **Mutation Testing**: "Testing the tests." Tools like Stryker modify the source code slightly to see if tests fail. If tests pass despite broken code, the tests lack assertions.

## 2. Package Overview
- **Package**: `@sys/assay`
- **System Plane**: Governance
- **Purpose**: Acts as the central test registry and quality gatekeeper.
- **Key Enforcements**:
  - **No Untracked / Stale Tests**: Cross-references `tests/manifest.json` against the physical disk.
  - **No Shell Tests**: Fatally blocks tests missing `expect()` assertions or utilizing static skips (`it.skip`). Flags tautologies (e.g., `expect(true).toBe(true)`) with warnings.
  - **Strict Governance**: High-risk governance tests require explicit CI triggers and mandate that the author and reviewer are distinct individuals (preventing reviewer-not-independent violations).

## 3. Contract Audit (The Sys Standard Conformance)
An audit of `@sys/assay` against the core architectural rules confirms strict compliance.

**Rule 1: Single Plane Ownership & Injected Seams**
- **Status:** ✅ Pass
- **Evidence:** Operates entirely on the Governance plane. External dependencies are injected via the `AssayHost` interface (`src/engine.ts:20`) rather than hardcoded `node:fs` calls.

**Rule 2: Single Composition Root & Safe Configuration**
- **Status:** ✅ Pass
- **Evidence:** Exposes a single entry point, `defineAssay(config)` (`src/config.ts:104`). The configuration is strictly validated at runtime using Zod `assayConfigSchema` (`src/config.ts:29`), rejecting bogus categories or unmapped risks.

**Rule 3: Zero App-Specific Imports**
- **Status:** ✅ Pass
- **Evidence:** The package is entirely self-contained. The `package.json` contains no direct dependencies on other sibling monorepo packages.

**Rule 4: Built Artifacts**
- **Status:** ✅ Pass
- **Evidence:** Compiles to a `dist/` directory via `tsup`, verified by the `package.json` build script (`package.json:22`).

**Rule 5: Taxonomy Classification & Traceable Versioning**
- **Status:** ✅ Pass
- **Evidence:** Formally registered in `taxonomy.yaml` with complete provenance data.

**Rule 8: Cross-Runtime Compatibility**
- **Status:** ✅ Pass
- **Evidence:** Provides a cross-language entry point via `src/cli.ts` (`src/cli.ts:1` featuring the `#!/usr/bin/env node` shebang), allowing secure invocation from non-JS environments.

## 4. Tests & Gaps
Running `pnpm --filter @sys/assay test` yields robust coverage:
- **What is tested:** 42 tests pass across 10 files. It covers engine validation, taxonomy parsing, negative config injection, and adversarial attacks (e.g. bypassing governance gates).
- **Mocks:** The engine is tested using an isolated `memHost` in `engine.test.ts`, proving "eat your own dog food" unit testing.
- **Gaps:** The package achieves its intended goal flawlessly. No undocumented gaps or unhandled edge cases were surfaced during the test run.

## 5. Associated Artifacts
As part of this study, a new test taxonomy draft was produced alongside the newly generated `@sys/chat` component.
- **Verification:** The component's tests (`session.test.ts`, `policy.test.ts`) are registered in `tests/manifest.json`.
- **CI Status:** `pnpm check` confirms all tests are registered, recognized, and green.
