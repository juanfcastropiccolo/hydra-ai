// Feature 006: tiny deterministic force layout (spring embedder) for ≤ ~150 visible nodes. Pure.
export interface LayoutNode {
  id: string
  weight: number
}
export interface LayoutEdge {
  a: string
  b: string
  w: number
}
export type Positions = Map<string, { x: number; y: number }>

const hash = (s: string): number => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967295
}

/** Deterministic (seeded by node ids): repulsion + springs, `iterations` steps. Never NaN. */
export function layout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  opts: { width: number; height: number; iterations?: number; prev?: Positions } = {
    width: 800,
    height: 600
  }
): Positions {
  const { width, height } = opts
  const n = nodes.length
  const pos: Positions = new Map()
  if (!n) return pos
  const cx = width / 2
  const cy = height / 2
  const R = Math.min(width, height) * 0.38
  nodes.forEach((node) => {
    const prev = opts.prev?.get(node.id)
    if (prev) pos.set(node.id, { ...prev })
    else {
      const a = hash(node.id) * Math.PI * 2
      const r = R * (0.35 + 0.65 * hash(node.id + '#r'))
      pos.set(node.id, { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r })
    }
  })
  const k = Math.sqrt((width * height) / (n + 1)) * 0.45
  const iters = opts.iterations ?? 220
  const byId = new Map(nodes.map((x) => [x.id, x]))
  for (let it = 0; it < iters; it++) {
    const temp = 0.09 * Math.min(width, height) * (1 - it / iters) + 1
    const disp = new Map<string, { x: number; y: number }>()
    for (const a of nodes) disp.set(a.id, { x: 0, y: 0 })
    // repulsion (O(n²): fine at ≤150)
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const A = nodes[i]!
        const B = nodes[j]!
        const pa = pos.get(A.id)!
        const pb = pos.get(B.id)!
        let dx = pa.x - pb.x
        let dy = pa.y - pb.y
        let d2 = dx * dx + dy * dy
        if (d2 < 0.01) {
          dx = (hash(A.id + B.id) - 0.5) * 0.1
          dy = (hash(B.id + A.id) - 0.5) * 0.1
          d2 = dx * dx + dy * dy
        }
        const d = Math.sqrt(d2)
        const f = (k * k) / d
        const ux = (dx / d) * f
        const uy = (dy / d) * f
        const da = disp.get(A.id)!
        const db = disp.get(B.id)!
        da.x += ux
        da.y += uy
        db.x -= ux
        db.y -= uy
      }
    // springs
    for (const e of edges) {
      const pa = pos.get(e.a)
      const pb = pos.get(e.b)
      if (!pa || !pb) continue
      const dx = pa.x - pb.x
      const dy = pa.y - pb.y
      const d = Math.max(0.1, Math.sqrt(dx * dx + dy * dy))
      const f = (d * d) / k / (1 + Math.log1p(e.w))
      const ux = (dx / d) * f
      const uy = (dy / d) * f
      const da = disp.get(e.a)
      const db = disp.get(e.b)
      if (da) {
        da.x -= ux
        da.y -= uy
      }
      if (db) {
        db.x += ux
        db.y += uy
      }
    }
    for (const node of nodes) {
      const p = pos.get(node.id)!
      const d = disp.get(node.id)!
      const len = Math.max(0.1, Math.sqrt(d.x * d.x + d.y * d.y))
      const heavier = 1 / (1 + Math.log1p(byId.get(node.id)?.weight ?? 1) * 0.2)
      p.x += (d.x / len) * Math.min(len, temp) * heavier
      p.y += (d.y / len) * Math.min(len, temp) * heavier
      // pull to centre keeps disconnected pieces on screen (stronger for leaves)
      const pull = (byId.get(node.id)?.weight ?? 1) <= 1 ? 0.045 : 0.02
      p.x += (cx - p.x) * pull
      p.y += (cy - p.y) * pull
      p.x = Math.max(24, Math.min(width - 24, p.x))
      p.y = Math.max(24, Math.min(height - 24, p.y))
    }
  }
  return pos
}
