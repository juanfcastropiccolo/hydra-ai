// Feature 006: the knowledge layer over the analytics indexer — same scans, no extra disk reads.
// Owns the cards store and the in-memory search index (rebuilt lazily when the base index changes).
import { EventEmitter } from 'node:events'
import { projectKeyFor } from '@shared/analytics/paths'
import type { Project } from '@shared/types'
import type { KnowSearchHit, KnowSearchQuery, SessionCard } from '@shared/know/types'
import type { AnalyticsIndexer } from '../analytics/analytics-indexer'
import { loadCards, saveCards, type CardsFile } from './cards-store'
import {
  buildSearchIndex,
  searchKnow,
  type KnowCorpus,
  type KnowSearchIndex,
  type SearchDeps
} from './know-search'
import { snippetFromTranscript } from './snippets'

export interface KnowIndexerOptions {
  analytics: AnalyticsIndexer
  cardsPath: string
  getProjects: () => Project[]
  home?: string
}

export interface KnowIndexerEvents {
  changed: []
}

export interface PendingSession {
  sessionId: string
  title: string
  lastTs: number
  /** true = has a card but the transcript grew since. */
  stale: boolean
}

export class KnowIndexer extends EventEmitter<KnowIndexerEvents> {
  private cardsFile: CardsFile
  private dirty = true
  private ix: KnowSearchIndex | null = null
  private paths = new Map<string, string>()

  constructor(private readonly opts: KnowIndexerOptions) {
    super()
    this.cardsFile = loadCards(opts.cardsPath)
    opts.analytics.on('sessions', () => {
      this.dirty = true
      this.emit('changed')
    })
  }

  cards(): Record<string, SessionCard> {
    return this.cardsFile.cards
  }

  setCard(sessionId: string, card: SessionCard): void {
    this.cardsFile.cards[sessionId] = card
    saveCards(this.opts.cardsPath, this.cardsFile)
    this.dirty = true
    this.emit('changed')
  }

  /** Apply supersede marks coming from a new card (FR-4). */
  applySuperseded(ids: string[], supersededBy: string): void {
    let touched = false
    for (const card of Object.values(this.cardsFile.cards))
      for (const f of card.facts)
        if (ids.includes(f.id) && !f.supersededBy) {
          f.supersededBy = supersededBy
          touched = true
        }
    if (touched) {
      saveCards(this.opts.cardsPath, this.cardsFile)
      this.dirty = true
      this.emit('changed')
    }
  }

  /** All vigente facts of a project (compact), for the card generator's supersede context. */
  vigenteFacts(projectKey: string, max = 30): Array<{ id: string; text: string }> {
    const out: Array<{ id: string; text: string; ts: number }> = []
    const corpus = this.searchIndex().corpus
    for (const { meta, k } of corpus.sessions.values()) {
      if (meta.projectKey !== projectKey) continue
      for (const f of k.card?.facts ?? [])
        if (!f.supersededBy) out.push({ id: f.id, text: f.text, ts: f.ts })
    }
    return out
      .sort((a, b) => b.ts - a.ts)
      .slice(0, max)
      .map(({ id, text }) => ({ id, text }))
  }

  /** Sessions whose card is missing or stale (transcript grew after generation). */
  pending(): PendingSession[] {
    const out: PendingSession[] = []
    for (const { meta, k } of this.searchIndex().corpus.sessions.values()) {
      if (meta.lastTs === 0) continue
      const card = k.card
      if (!card)
        out.push({
          sessionId: meta.sessionId,
          title: meta.title,
          lastTs: meta.lastTs,
          stale: false
        })
      else if (meta.lastTs > card.sourceLastTs)
        out.push({ sessionId: meta.sessionId, title: meta.title, lastTs: meta.lastTs, stale: true })
    }
    return out.sort((a, b) => b.lastTs - a.lastTs)
  }

  meta(
    sessionId: string
  ): { title: string; cwd: string; projectKey: string; lastTs: number } | null {
    const s = this.searchIndex().corpus.sessions.get(sessionId)
    return s
      ? {
          title: s.meta.title,
          cwd: s.meta.cwd,
          projectKey: s.meta.projectKey,
          lastTs: s.meta.lastTs
        }
      : null
  }

  card(sessionId: string): SessionCard | undefined {
    return this.cardsFile.cards[sessionId]
  }

  searchIndex(): KnowSearchIndex {
    if (this.ix && !this.dirty) return this.ix
    const corpus: KnowCorpus = { sessions: new Map() }
    this.paths.clear()
    const projects = this.opts.getProjects()
    for (const { summary, transcriptPath, knowledge } of this.opts.analytics.knowledge()) {
      const pk = projectKeyFor(summary.cwd, projects, this.opts.home)
      this.paths.set(summary.sessionId, transcriptPath)
      corpus.sessions.set(summary.sessionId, {
        meta: {
          sessionId: summary.sessionId,
          title: summary.title,
          cwd: summary.cwd,
          projectKey: pk.key,
          projectLabel: pk.label,
          firstTs: summary.firstTs,
          lastTs: summary.lastTs
        },
        k: { ...knowledge, card: this.cardsFile.cards[summary.sessionId] }
      })
    }
    this.ix = buildSearchIndex(corpus)
    this.dirty = false
    return this.ix
  }

  search(q: KnowSearchQuery, deps: Omit<SearchDeps, 'snippetFor'> = {}): KnowSearchHit[] {
    return searchKnow(this.searchIndex(), q, {
      ...deps,
      snippetFor: (id, terms) => {
        const p = this.paths.get(id)
        return p ? snippetFromTranscript(p, terms) : null
      }
    })
  }
}
