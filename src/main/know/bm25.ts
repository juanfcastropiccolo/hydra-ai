// Feature 006: BM25 over per-session term bags (document = session). Pure, tiny corpus (≤ ~1000 docs).
import type { TermBag } from './term-bag'

export interface Bm25Doc {
  id: string
  bag: TermBag
}

export interface Bm25Index {
  docs: Bm25Doc[]
  avgLen: number
  /** term → number of docs containing it */
  df: Record<string, number>
  len: Record<string, number>
}

export function buildBm25(docs: Bm25Doc[]): Bm25Index {
  const df: Record<string, number> = {}
  const len: Record<string, number> = {}
  let total = 0
  for (const d of docs) {
    let l = 0
    for (const [t, n] of Object.entries(d.bag)) {
      l += n
      df[t] = (df[t] ?? 0) + 1
    }
    len[d.id] = l
    total += l
  }
  return { docs, avgLen: docs.length ? total / docs.length : 0, df, len }
}

const K1 = 1.2
const B = 0.75

/** Scores (docId → score) for the query terms; only docs with at least one hit appear. */
export function bm25Scores(ix: Bm25Index, terms: string[]): Map<string, number> {
  const N = ix.docs.length
  const out = new Map<string, number>()
  if (!N) return out
  const uniq = [...new Set(terms)]
  for (const d of ix.docs) {
    let score = 0
    for (const t of uniq) {
      const tf = d.bag[t]
      if (!tf) continue
      const df = ix.df[t] ?? 0
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5))
      const norm =
        (tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * (ix.len[d.id] ?? 0)) / (ix.avgLen || 1)))
      score += idf * norm
    }
    if (score > 0) out.set(d.id, score)
  }
  return out
}
