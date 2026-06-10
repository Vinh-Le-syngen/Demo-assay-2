import { describe, it, expect } from 'vitest'
import {
  affected,
  validateGraph,
  type DependencyGraph,
  type FileNode,
} from '../core'

// Adversarial (resilience): the graph is project-supplied data that may be hostile, machine-
// generated, or corrupted. This file pins the RESOURCE-ABUSE axis — the engine must terminate
// and stay correct under pathological shapes (deep cycles, dense fan-out, large N) without
// hanging, blowing the stack, or throwing. (The protocol-misuse axis — malformed edge/node
// objects — lives in the sibling adversarial-protocol.test.ts.)

describe('resource-abuse: pathological graph shapes terminate', () => {
  it('terminates on a long cycle without infinite-looping', () => {
    // Build a single cycle 0 → 1 → ... → N-1 → 0. A naive walk would loop forever.
    const N = 5_000
    const files: Record<string, FileNode> = {}
    for (let i = 0; i < N; i++) files[`n${i}`] = { impacts: [{ target: `n${(i + 1) % N}` }] }
    const graph: DependencyGraph = { files }
    const items = affected(graph, ['n0'])
    // Every node except the seed is reachable exactly once.
    expect(items).toHaveLength(N - 1)
    expect(items.find((i) => i.file === 'n0')).toBeUndefined()
  })

  it('handles a dense fan-out (one source → many targets) within budget', () => {
    const N = 10_000
    const files: Record<string, FileNode> = { hub: { impacts: [] } }
    const impacts = files.hub!.impacts!
    for (let i = 0; i < N; i++) {
      files[`leaf${i}`] = {}
      impacts.push({ target: `leaf${i}` })
    }
    const graph: DependencyGraph = { files }
    const start = performance.now()
    const items = affected(graph, ['hub'])
    const elapsed = performance.now() - start
    expect(items).toHaveLength(N)
    expect(elapsed).toBeLessThan(2_000) // generous ceiling; guards against accidental O(N^2)
  })

  it('validateGraph survives a fully-connected adversarial graph', () => {
    // Every node impacts every other node — O(N^2) edges. Must complete and report cleanly
    // (no dangling targets, no self/duplicate edges) rather than hang.
    const N = 200
    const names = Array.from({ length: N }, (_, i) => `f${i}`)
    const files: Record<string, FileNode> = {}
    for (const a of names) {
      files[a] = { impacts: names.filter((b) => b !== a).map((b) => ({ target: b })) }
    }
    expect(validateGraph({ files })).toEqual([])
  })
})
