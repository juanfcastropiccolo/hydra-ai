// Feature 005: analytics types shared by main (indexer) and renderer (dashboard). No Node/DOM imports.

/** Token counts as Claude Code reports them per assistant message (`message.usage`). */
export interface TokenCounts {
  input: number
  output: number
  cacheWrite: number
  cacheRead: number
}
export const ZERO_TOKENS: TokenCounts = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 }

/** One transcript (= one Claude Code session, with its sub-agents folded in). Cached and sent over IPC. */
export interface SessionSummary {
  sessionId: string
  /** Working directory of the session (first record that carried one). */
  cwd: string
  /** custom-title > ai-title > first user prompt (trimmed) > sessionId. */
  title: string
  /** ms epoch of the first / last record with a timestamp; 0 when none. */
  firstTs: number
  lastTs: number
  userTurns: number
  assistantMsgs: number
  /** Sum of system/turn_duration records. */
  durationMs: number
  tokensByModel: Record<string, TokenCounts>
  /** tool_use blocks counted by tool name. */
  tools: Record<string, number>
  gitBranch?: string
  /** Lines that failed to parse or were unknown (tolerance, FR-14). */
  skippedLines: number
  /** Number of sub-agent transcripts folded into this summary. */
  subagents: number
  /** 'YYYY-MM-DD' (local time at indexing) → tokens, for the by-day chart. */
  tokensByDay: Record<string, TokenCounts>
  /** [dow 0-6 (Sun=0)][hour 0-23] → user turns, local time at indexing. */
  turnsByHourDow: number[][]
  /** Same shape, total tokens (input+output+cache) per cell. */
  tokensByHourDow: number[][]
}

export type AnalyticsRangePreset = 'today' | '7d' | '30d' | 'all'
export type AnalyticsRange = AnalyticsRangePreset | { from: string; to: string } // 'YYYY-MM-DD' inclusive

/** USD per million tokens. */
export interface ModelPricing {
  input: number
  output: number
  cacheWrite: number
  cacheRead: number
}

export interface AnalyticsPrefs {
  range: AnalyticsRange
  /** Overrides / additions keyed by model id or family prefix. */
  pricing: Record<string, ModelPricing>
}
export const DEFAULT_ANALYTICS_PREFS: AnalyticsPrefs = { range: '7d', pricing: {} }

export type CenterView = 'sessions' | 'analytics' | 'graph'

export interface AnalyticsProgress {
  phase: 'cache' | 'scan' | 'watch'
  done: number
  total: number
}
