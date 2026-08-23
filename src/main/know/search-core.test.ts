import { describe, expect, it } from 'vitest'
import { bm25Scores, buildBm25 } from './bm25'
import { addEdge, emptyGraph, ppr } from './graph'
import { rrf, topOf } from './rrf'

describe('bm25', () => {
  const ix = buildBm25([
    { id: 'A', bag: { auth: 5, login: 2, token: 1, otros: 30 } },
    { id: 'B', bag: { auth: 1, grafo: 4 } },
    { id: 'C', bag: { grafo: 10, nodos: 3 } }
  ])
  it('ranks by tf-idf with length normalisation', () => {
    const s = bm25Scores(ix, ['auth'])
    expect([...s.keys()].sort()).toEqual(['A', 'B'])
    expect(s.get('A')!).toBeGreaterThan(s.get('B')!)
    const g = bm25Scores(ix, ['grafo', 'nodos'])
    expect(topOf(g, 1)).toEqual(['C'])
    expect(bm25Scores(ix, ['inexistente']).size).toBe(0)
    expect(bm25Scores(buildBm25([]), ['x']).size).toBe(0)
  })
})

describe('ppr', () => {
  it('multi-hop: a file seed lifts the session that touched it and the facts of that session', () => {
    const g = emptyGraph()
    // session S1 touched file F and has fact H1; session S2 unrelated
    addEdge(g, 's:S1', 'f:F', 2)
    addEdge(g, 's:S1', 'h:H1', 1)
    addEdge(g, 's:S1', 'p:P', 1)
    addEdge(g, 's:S2', 'p:P', 1)
    addEdge(g, 's:S2', 'h:H2', 1)
    const r = ppr(g, ['f:F'])
    expect(r.get('s:S1')!).toBeGreaterThan(r.get('s:S2') ?? 0)
    expect(r.get('h:H1')!).toBeGreaterThan(r.get('h:H2') ?? 0)
  })
  it('empty seeds or unknown nodes → empty', () => {
    const g = emptyGraph()
    addEdge(g, 'a', 'b')
    expect(ppr(g, []).size).toBe(0)
    expect(ppr(g, ['nope']).size).toBe(0)
  })
  it('is fast on thousands of nodes', () => {
    const g = emptyGraph()
    for (let i = 0; i < 5000; i++) addEdge(g, `s:${i}`, `f:${i % 500}`)
    const t0 = performance.now()
    const r = ppr(g, ['f:1', 'f:2'])
    expect(performance.now() - t0).toBeLessThan(50)
    expect(r.size).toBeGreaterThan(0)
  })
})

describe('rrf', () => {
  it('fuses rankings and rewards agreement', () => {
    const fused = rrf(['A', 'B', 'C'], ['B', 'A'])
    expect(topOf(fused, 3)).toEqual(['A', 'B', 'C'])
    const fused2 = rrf(['A', 'B'], ['B', 'C'], ['B'])
    expect(topOf(fused2, 1)).toEqual(['B'])
  })
})
