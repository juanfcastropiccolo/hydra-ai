// Feature 006: the search pipeline (FR-6/7/8). Pure over an in-memory view of the index; the same
// function serves the MCP tools and the UI.
import { dayStart, addDays } from '@shared/analytics/time-buckets'
import type { Fact, KnowSearchHit, KnowSearchQuery, SessionKnowledge } from '@shared/know/types'
import { bm25Scores, buildBm25, type Bm25Index } from './bm25'
import { addEdge, emptyGraph, ppr, type KnowGraph } from './graph'
import { rrf, topOf } from './rrf'
import { tokenize } from './term-bag'
import { isTempCwd } from '@shared/analytics/temp-paths'

export interface KnowSessionMeta {
  sessionId: string
  title: string
  cwd: string
  projectKey: string
  projectLabel: string
  firstTs: number
  lastTs: number
}

export interface KnowCorpus {
  sessions: Map<string, { meta: KnowSessionMeta; k: SessionKnowledge }>
}

export interface KnowSearchIndex {
  corpus: KnowCorpus
  bm25: Bm25Index
  graph: KnowGraph
  /** term/file → node id, for seeding. */
  entityNodes: Map<string, string>
}

const fileKey = (p: string): string => p.toLowerCase()
const last = (p: string): string => p.split('/').filter(Boolean).pop() ?? p

/** Build the searchable structures from the corpus (call on load / after index changes). */
export function buildSearchIndex(corpus: KnowCorpus): KnowSearchIndex {
  const graph = emptyGraph()
  const entityNodes = new Map<string, string>()
  const docs: Array<{ id: string; bag: Record<string, number> }> = []
  for (const { meta, k } of corpus.sessions.values()) {
    const s = `s:${meta.sessionId}`
    addEdge(graph, s, `p:${meta.projectKey}`, 1)
    docs.push({ id: meta.sessionId, bag: k.termBag })
    for (const [file, n] of Object.entries(k.files)) {
      if (isTempCwd(file)) continue // scratch files from test runs add noise, not knowledge
      const fk = `f:${fileKey(file)}`
      addEdge(graph, s, fk, Math.min(5, n))
      entityNodes.set(fileKey(file), fk)
      entityNodes.set(last(fileKey(file)), fk)
    }
    for (const fact of k.card?.facts ?? []) {
      const h = `h:${fact.id}`
      addEdge(graph, s, h, 1)
      for (const e of fact.entities) {
        const ek = e.toLowerCase()
        const isFile = ek.includes('/') || /\.\w{1,10}$/.test(ek)
        const node = isFile ? `f:${ek}` : `t:${ek}`
        addEdge(graph, h, node, 2)
        entityNodes.set(ek, node)
        if (isFile) entityNodes.set(last(ek), node)
        else for (const t of tokenize(ek)) if (!entityNodes.has(t)) entityNodes.set(t, node)
      }
    }
  }
  return { corpus, bm25: buildBm25(docs), graph, entityNodes }
}

export const DEFAULT_LIMIT = 5
export const OUTPUT_BUDGET_CHARS = 4000

export interface SearchDeps {
  /** Snippet provider for sessions without matching facts (top-k only); may return null. */
  snippetFor?: (sessionId: string, terms: string[]) => string | null
  liveSessionIds?: ReadonlySet<string>
}

export function searchKnow(
  ix: KnowSearchIndex,
  q: KnowSearchQuery,
  deps: SearchDeps = {}
): KnowSearchHit[] {
  const terms = tokenize(q.query)
  if (!terms.length) return []
  const limit = Math.max(1, Math.min(q.limit ?? DEFAULT_LIMIT, 20))

  // seeds: entity nodes matched by query terms (and full query as a path)
  const seedSet = new Set<string>()
  for (const t of [...terms, q.query.trim().toLowerCase()]) {
    const node = ix.entityNodes.get(t)
    if (node) seedSet.add(node)
  }
  const lexical = bm25Scores(ix.bm25, terms)
  const graphScores = ppr(ix.graph, [...seedSet])
  const graphSessions = new Map<string, number>()
  for (const [node, score] of graphScores)
    if (node.startsWith('s:')) graphSessions.set(node.slice(2), score)

  const inRange = (id: string): boolean => {
    const s = ix.corpus.sessions.get(id)
    if (!s) return false
    if (q.excludeSessionId && id === q.excludeSessionId) return false
    if (q.projectKey && s.meta.projectKey !== q.projectKey) return false
    if (q.from && s.meta.lastTs < dayStart(q.from)) return false
    if (q.to && s.meta.firstTs >= dayStart(addDays(q.to, 1))) return false
    return true
  }
  const lexRank = topOf(lexical, 50).filter(inRange)
  const graphRank = topOf(graphSessions, 50).filter(inRange)
  const fused = rrf(lexRank, graphRank)
  const ids = topOf(fused, limit)

  const factScore = (f: Fact): number => {
    const hitEntities = f.entities.filter((e) => {
      const el = e.toLowerCase()
      return (
        terms.some((t) => el.includes(t)) ||
        (graphScores.get(ix.entityNodes.get(el) ?? '') ?? 0) > 0
      )
    })
    const textHits = tokenize(f.text).filter((t) => terms.includes(t)).length
    return hitEntities.length * 2 + textHits + ((graphScores.get(`h:${f.id}`) ?? 0) > 0 ? 1 : 0)
  }

  let budget = OUTPUT_BUDGET_CHARS
  const hits: KnowSearchHit[] = []
  for (const id of ids) {
    const s = ix.corpus.sessions.get(id)
    if (!s) continue
    const facts = (s.k.card?.facts ?? [])
      .map((f) => ({ f, score: factScore(f) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => (a.f.supersededBy ? 1 : 0) - (b.f.supersededBy ? 1 : 0) || b.score - a.score)
    const vigentes = facts.filter((x) => !x.f.supersededBy).slice(0, 4)
    const replaced = facts.filter((x) => x.f.supersededBy).slice(0, 2)
    const matchedEntities = [
      ...new Set(
        vigentes.flatMap((x) =>
          x.f.entities.filter((e) => terms.some((t) => e.toLowerCase().includes(t)))
        )
      )
    ].slice(0, 6)
    const hit: KnowSearchHit = {
      sessionId: id,
      title: s.meta.title,
      cwd: s.meta.cwd,
      projectLabel: s.meta.projectLabel,
      firstTs: s.meta.firstTs,
      lastTs: s.meta.lastTs,
      score: fused.get(id) ?? 0,
      facts: vigentes.map(({ f }) => ({ id: f.id, text: f.text, kind: f.kind })),
      replaced: replaced.map(({ f }) => ({ id: f.id, text: f.text })),
      entities: matchedEntities
    }
    if (hit.facts.length === 0) {
      const snip = deps.snippetFor?.(id, terms) ?? summaryFallback(s.k)
      if (snip) hit.snippet = snip.slice(0, 400)
    }
    if (deps.liveSessionIds?.has(id)) hit.live = true
    const cost = JSON.stringify(hit).length
    if (budget - cost < 0 && hits.length > 0) break
    budget -= cost
    hits.push(hit)
  }
  return hits
}

function summaryFallback(k: SessionKnowledge): string | null {
  if (k.card?.summary) return k.card.summary
  const files = Object.keys(k.files)
    .filter((f) => !isTempCwd(f))
    .slice(0, 5)
    .map((f) => f.split('/').slice(-2).join('/'))
  return files.length ? `Archivos tocados: ${files.join(', ')}` : null
}
