// @sys/atlas core — dependency-graph impact analysis (Governance). Pure and IO-free: every
// function takes an already-parsed DependencyGraph object and returns plain data. The graph
// itself (which file impacts which, which concepts a file provides/consumes) is project-owned
// and injected; this engine only walks it. Extracted from cadre-os SYS-ATLAS (affected.sh /
// validate-graph.sh / propagation guard).

/** Severity of a node — used to rank an impact set so the riskiest fallout surfaces first. */
export type Criticality = 'critical' | 'high' | 'medium' | 'low'

/** A directed "changing SOURCE may break TARGET" edge. */
export type ImpactEdge = {
  target: string
  /** Why the edge exists (e.g. 'breakage_observed', 'pattern_match'). Advisory. */
  reasons?: string[]
  /** ISO date the edge was last confirmed. Advisory. */
  confirmed?: string
}

/** A node in the graph: one tracked file/artifact and its declared relationships. */
export type FileNode = {
  kind?: string
  criticality?: Criticality
  /** Concepts this file is the source of truth for. */
  provides_concepts?: string[]
  /** Concepts this file depends on (consumers of another file's provided concept). */
  consumes_concepts?: string[]
  /** Direct structural impact edges (this file → files it can break). */
  impacts?: ImpactEdge[]
}

/** The declared dependency graph. `files` is keyed by repo-relative path. */
export type DependencyGraph = {
  version?: number
  files: Record<string, FileNode>
}

/** One transitively-affected file, with why and how severe. */
export type AffectedItem = {
  file: string
  criticality: Criticality
  /** How this file was reached: 'impacts' (structural edge) or 'concept:<name>'. */
  reason: string
}

export type AffectedOptions = {
  /** Paths to never include in the result (e.g. generated files). */
  exempt?: string[]
}

const CRIT_ORDER: Record<Criticality, number> = { critical: 0, high: 1, medium: 2, low: 3 }

function nodeOf(graph: DependencyGraph, f: string): FileNode | undefined {
  return graph.files?.[f] ?? undefined
}

function directImpacts(graph: DependencyGraph, f: string): string[] {
  return (nodeOf(graph, f)?.impacts ?? []).map((e) => e?.target).filter((t): t is string => !!t)
}

function providedConcepts(graph: DependencyGraph, f: string): string[] {
  return nodeOf(graph, f)?.provides_concepts ?? []
}

function criticalityOf(graph: DependencyGraph, f: string): Criticality {
  return nodeOf(graph, f)?.criticality ?? 'medium'
}

/** Files that declare they consume `concept`. */
export function conceptConsumers(graph: DependencyGraph, concept: string): string[] {
  const out: string[] = []
  for (const [name, node] of Object.entries(graph.files ?? {})) {
    if (node && (node.consumes_concepts ?? []).includes(concept)) out.push(name)
  }
  return out
}

/** Every concept any file provides. */
export function providedConceptSet(graph: DependencyGraph): Set<string> {
  const set = new Set<string>()
  for (const node of Object.values(graph.files ?? {})) {
    for (const c of node?.provides_concepts ?? []) set.add(c)
  }
  return set
}

/**
 * Transitive impact closure for one or more changed inputs. Each input is either a file
 * (a graph key) or a concept (matched against provided/consumed concepts). Walks structural
 * impact edges AND concept edges (a changed file's provided concept reaches every file that
 * consumes it). The seed inputs themselves are NOT included — only what they affect.
 * Result is de-duplicated and ranked critical → low.
 */
export function affected(
  graph: DependencyGraph,
  inputs: string[],
  opts: AffectedOptions = {},
): AffectedItem[] {
  const files = graph.files ?? {}
  const exempt = new Set(opts.exempt ?? [])
  const visited = new Set<string>()
  const results = new Map<string, AffectedItem>()
  const stack: Array<{ file: string; reason: string }> = []

  // Push a file's outgoing edges (structural impacts + provided-concept consumers).
  const pushEdges = (file: string): void => {
    for (const target of directImpacts(graph, file)) {
      if (!visited.has(target)) stack.push({ file: target, reason: 'impacts' })
    }
    for (const concept of providedConcepts(graph, file)) {
      for (const consumer of conceptConsumers(graph, concept)) {
        if (!visited.has(consumer)) stack.push({ file: consumer, reason: `concept:${concept}` })
      }
    }
  }

  // Seed: file inputs are marked visited up front so they're expanded but never reported as
  // "affected" (a change doesn't affect itself). Concept inputs seed their consumers directly.
  for (const input of inputs) if (input in files) visited.add(input)
  for (const input of inputs) {
    if (input in files) pushEdges(input)
    else for (const consumer of conceptConsumers(graph, input)) {
      if (!visited.has(consumer)) stack.push({ file: consumer, reason: `concept:${input}` })
    }
  }

  while (stack.length) {
    const { file, reason } = stack.pop()!
    if (visited.has(file)) continue
    visited.add(file)
    if (!exempt.has(file)) {
      results.set(file, { file, criticality: criticalityOf(graph, file), reason })
    }
    pushEdges(file)
  }

  return [...results.values()].sort(
    (a, b) => CRIT_ORDER[a.criticality] - CRIT_ORDER[b.criticality] || a.file.localeCompare(b.file),
  )
}

/**
 * Referential-integrity check of the graph. Returns a flat list of error strings (empty = valid):
 *  - `files` is an object,
 *  - no null nodes,
 *  - `criticality` (when present) is a valid enum,
 *  - every impact edge has a target, no self-impact, no duplicate targets,
 *  - every impact target is itself a node in the graph (no dangling edges).
 * Concept-orphan detection is a separate, softer check (`orphanConsumedConcepts`).
 */
export function validateGraph(graph: DependencyGraph): string[] {
  const errors: string[] = []
  const files = graph?.files
  if (!files || typeof files !== 'object') return ['graph.files must be an object']

  const keys = new Set(Object.keys(files))
  const validCrit = new Set<Criticality>(['critical', 'high', 'medium', 'low'])

  for (const [name, node] of Object.entries(files)) {
    if (node == null) {
      errors.push(`[${name}] node is null`)
      continue
    }
    if (node.criticality && !validCrit.has(node.criticality)) {
      errors.push(`[${name}] invalid criticality '${node.criticality}'`)
    }
    const seenTargets = new Set<string>()
    for (const edge of node.impacts ?? []) {
      const target = edge?.target
      if (!target) {
        errors.push(`[${name}] impact edge missing target`)
        continue
      }
      if (target === name) errors.push(`[${name}] self-impact edge`)
      if (!keys.has(target)) errors.push(`[${name}] impact target not in graph: '${target}'`)
      if (seenTargets.has(target)) errors.push(`[${name}] duplicate impact target '${target}'`)
      seenTargets.add(target)
    }
  }
  return errors
}

/** Concepts that some file consumes but no file provides (a soft integrity smell). */
export function orphanConsumedConcepts(graph: DependencyGraph): string[] {
  const provided = providedConceptSet(graph)
  const orphans = new Set<string>()
  for (const node of Object.values(graph.files ?? {})) {
    for (const c of node?.consumes_concepts ?? []) if (!provided.has(c)) orphans.add(c)
  }
  return [...orphans].sort()
}

/** A changed file whose declared impact targets were not also changed. */
export type PropagationGap = { source: string; missingTargets: string[] }

export type PropagationOptions = {
  /** Sources/targets to ignore (e.g. generated files, or known-safe edges). */
  exempt?: string[]
}

/**
 * The propagation guard. Given the set of changed files, find each changed file that declares
 * impact edges whose targets were NOT also changed — i.e. you touched a source but not the
 * dependents it can break. Returns one gap per offending source. Empty = fully propagated.
 */
export function propagationGaps(
  graph: DependencyGraph,
  changed: string[],
  opts: PropagationOptions = {},
): PropagationGap[] {
  const files = graph.files ?? {}
  const changedSet = new Set(changed)
  const exempt = new Set(opts.exempt ?? [])
  const gaps: PropagationGap[] = []

  for (const source of changed) {
    if (exempt.has(source)) continue
    const targets = (files[source]?.impacts ?? []).map((e) => e?.target).filter((t): t is string => !!t)
    const missing = targets.filter((t) => !changedSet.has(t) && !exempt.has(t))
    if (missing.length) gaps.push({ source, missingTargets: [...new Set(missing)].sort() })
  }
  return gaps
}
