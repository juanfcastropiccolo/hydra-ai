// Feature 006: the knowledge graph + Personalized PageRank. Pure; built in memory from the index.
// Node ids are prefixed by type: 's:<sessionId>' 'p:<projectKey>' 'f:<path>' 't:<term>' 'h:<factId>'.

export interface KnowGraph {
  /** adjacency with weights (undirected: both directions present). */
  adj: Map<string, Array<{ to: string; w: number }>>
  nodes: Set<string>
}

export function emptyGraph(): KnowGraph {
  return { adj: new Map(), nodes: new Set() }
}

export function addEdge(g: KnowGraph, a: string, b: string, w = 1): void {
  if (a === b) return
  g.nodes.add(a)
  g.nodes.add(b)
  const la = g.adj.get(a) ?? []
  const lb = g.adj.get(b) ?? []
  const ea = la.find((e) => e.to === b)
  if (ea) ea.w += w
  else la.push({ to: b, w })
  const eb = lb.find((e) => e.to === a)
  if (eb) eb.w += w
  else lb.push({ to: a, w })
  g.adj.set(a, la)
  g.adj.set(b, lb)
}

const ALPHA = 0.15 // restart probability

/**
 * Personalized PageRank from `seeds` (uniform restart mass over them). Power iteration over the
 * weighted adjacency; returns node → score. Fast for a few thousand nodes.
 */
export function ppr(g: KnowGraph, seeds: string[], iterations = 25): Map<string, number> {
  const valid = seeds.filter((s) => g.nodes.has(s))
  const out = new Map<string, number>()
  if (!valid.length) return out
  const restart = 1 / valid.length
  let rank = new Map<string, number>(valid.map((s) => [s, restart]))
  const outW = new Map<string, number>()
  for (const [n, edges] of g.adj)
    outW.set(
      n,
      edges.reduce((a, e) => a + e.w, 0)
    )
  for (let i = 0; i < iterations; i++) {
    const next = new Map<string, number>()
    for (const s of valid) next.set(s, ALPHA * restart)
    for (const [n, r] of rank) {
      const edges = g.adj.get(n)
      const w = outW.get(n)
      if (!edges || !w) continue
      const spread = (1 - ALPHA) * r
      for (const e of edges) next.set(e.to, (next.get(e.to) ?? 0) + (spread * e.w) / w)
    }
    rank = next
  }
  return rank
}
