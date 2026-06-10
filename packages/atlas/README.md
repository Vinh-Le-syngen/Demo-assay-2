# @sys/atlas

Dependency-graph impact analysis + propagation guard: a pure engine over a declared file dependency graph.

**Plane:** governance (primary), data  ·  part of the `@sys/*` reusable-subsystem monorepo.

## Install

Vendored into consumers as a tarball today (registry publish deferred):

```json
"@sys/atlas": "file:vendor/sys-atlas-0.0.1.tgz"
```

## API

- `affected(graph, inputs, opts?): AffectedItem[]` — transitive impact closure of changed files/concepts, ranked critical → low (seeds excluded).
- `validateGraph(graph): string[]` — referential-integrity errors (bad criticality, dangling/self/duplicate impact edges); empty = valid.
- `propagationGaps(graph, changed, opts?): PropagationGap[]` — changed sources whose declared impact targets were not also changed.
- `conceptConsumers(graph, concept): string[]` — files that declare they consume a concept.
- `providedConceptSet(graph): Set<string>` — every concept any file provides.
- `orphanConsumedConcepts(graph): string[]` — consumed-but-never-provided concepts (soft smell).
- `DependencyGraph`, `FileNode`, `ImpactEdge`, `AffectedItem`, `PropagationGap`, `Criticality` (types) — the graph shape.

## Usage

```ts
import { affected, validateGraph, propagationGaps } from '@sys/atlas'

const graph = { files: { 'a.ts': { impacts: [{ target: 'b.ts' }] }, 'b.ts': {} } }

const errors = validateGraph(graph)          // []  → graph is sound
const blast = affected(graph, ['a.ts'])      // [{ file: 'b.ts', ... }]
const gaps = propagationGaps(graph, ['a.ts']) // a.ts changed but b.ts didn't
```

## Extend via

The dependency graph (project-supplied data: which file impacts which, provides/consumes concepts).

## CLI

```
sys-atlas
```
