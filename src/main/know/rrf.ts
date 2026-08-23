// Reciprocal Rank Fusion (Cormack 2009), k = 60. Pure.
const K = 60

/** Fuse ranked lists (each: ids best-first) into id → fused score. */
export function rrf(...rankings: string[][]): Map<string, number> {
  const out = new Map<string, number>()
  for (const list of rankings) {
    list.forEach((id, i) => out.set(id, (out.get(id) ?? 0) + 1 / (K + i + 1)))
  }
  return out
}

export function topOf(scores: Map<string, number>, n: number): string[] {
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([id]) => id)
}
