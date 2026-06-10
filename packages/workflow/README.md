# @eng/workflow

Control-plane **workflow engine**: the `WorkflowDefinition` contract (stages, gates, transitions) + a pure executor (`advance` / gate evaluation / transitions). App specifics — service vocabulary, roles, real gate data — are injected as seams; the package owns no app code and has zero runtime deps. Extracted from Qarar (ADR-0002/0007).

**Plane:** control  ·  `@eng/*` (pure control-plane engine)  ·  part of the `@sys/*` reusable-subsystem monorepo.

## Install

Vendored into consumers as a tarball today (registry publish deferred):

```json
"@eng/workflow": "file:vendor/eng-workflow-0.0.1.tgz"
```

## API

- `validateWorkflowDefinition(def): string[]` — referential-integrity errors (bad stage/gate/transition refs); empty = valid.
- `startStage(def): Stage | undefined` — the entry stage.
- `allowedTransitions(def, fromKey): string[]` — stage keys reachable from a given stage.
- `pendingGates(stage, ctx): Gate[]` — gates not yet satisfied in the current context.
- `evaluateGate(gate, ctx): boolean` — is a single gate satisfied?
- `advance(def, fromKey, ctx): AdvanceResult` — attempt a transition; returns the next stage or the blocking gates.
- Vocabulary/contract: `WorkflowDefinition`, `Stage` / `STAGE_KINDS` / `StagePresentation`, `Gate` / `GATE_KINDS` / `GateContext`, `FieldSpec` / `FieldType` / `FIELD_TYPES`, `Role` / `DEFAULT_ROLES`, `VALIDATION_RULES`, `AdvanceResult`, `ValidateOptions`.

## Usage

```ts
import { validateWorkflowDefinition, advance } from '@eng/workflow'

const errors = validateWorkflowDefinition(def)   // [] → sound
const result = advance(def, 'review', ctx)
// → { ok: true, next: 'approved' }  |  { ok: false, blockedBy: [...gates] }
```

## Extend via

The `WorkflowDefinition` (app-supplied stages/gates/transitions) + the `GateContext` (real gate data: who approved, which checks passed). The executor stays pure.
