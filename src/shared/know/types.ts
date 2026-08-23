// Feature 006: Graph Know types shared by main (indexer/MCP) and renderer (view). No Node/DOM imports.

export type FactKind = 'decision' | 'dato' | 'estado' | 'pendiente'

export interface Fact {
  /** Stable id: `${sessionId}#${n}`. */
  id: string
  text: string
  kind: FactKind
  /** Entity keys: file paths, topic slugs. */
  entities: string[]
  /** ms epoch (session lastTs at generation). */
  ts: number
  /** Set when a newer fact replaced this one (FR-4). */
  supersededBy?: string
}

export interface SessionCard {
  summary: string
  facts: Fact[]
  generatedAt: number
  /** lastTs of the transcript when the card was generated; transcript newer than this → pending again. */
  sourceLastTs: number
  model: string
  costUsd?: number
  /** True when the generation had to fall back / partial (FR edge case). */
  partial?: boolean
}

/** Per-session knowledge stored in know-index.json (besides what 005 already keeps). */
export interface SessionKnowledge {
  /** term → frequency (tokenized user+assistant text, capped). */
  termBag: Record<string, number>
  /** file path → touch count (Edit/Write/Read/NotebookEdit inputs). */
  files: Record<string, number>
  /** First tokens of Bash commands, deduped, capped. */
  commands: string[]
  card?: SessionCard
}

export interface KnowSearchQuery {
  query: string
  /** ProjectKey.key (project id or cwd) or null. */
  projectKey?: string | null
  /** 'YYYY-MM-DD' inclusive bounds. */
  from?: string
  to?: string
  excludeSessionId?: string
  limit?: number
}

export interface KnowSearchHit {
  sessionId: string
  title: string
  cwd: string
  projectLabel: string
  firstTs: number
  lastTs: number
  score: number
  /** Vigente facts that matched (empty when the session has no card). */
  facts: Array<Pick<Fact, 'id' | 'text' | 'kind' | 'supersededBy'>>
  /** Superseded facts that matched, shown as history. */
  replaced: Array<Pick<Fact, 'id' | 'text'>>
  /** Matched entities (files/topics). */
  entities: string[]
  /** Present when the session has no card (or nothing matched in it). */
  snippet?: string
  live?: boolean
}

export interface KnowStatus {
  indexedSessions: number
  cardsDone: number
  cardsPending: number
  /** Sessions currently queued / generating. */
  generating: string | null
  estCostUsd: number
  autoCards: boolean
  mcp: { state: 'off' | 'serving' | 'port-taken'; port: number; registered: boolean }
  lastError: string | null
}

export interface KnowPrefs {
  autoCards: boolean
  port: number
}
export const DEFAULT_KNOW_PREFS: KnowPrefs = { autoCards: true, port: 4855 }
