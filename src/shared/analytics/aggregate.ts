// Feature 005: pure aggregation over SessionSummary[] for the dashboard (runs in the renderer).
import { addTokenCounts, costOf, totalTokens } from './cost'
import { projectKeyFor, type ProjectKey } from './paths'
import { addDays, dayKey, dayRange, dayStart, weekStart } from './time-buckets'
import {
  ZERO_TOKENS,
  type AnalyticsRange,
  type ModelPricing,
  type SessionSummary,
  type TokenCounts
} from './types'
import type { Project } from '../types'

export interface Bounds {
  /** inclusive day keys */
  from: string
  to: string
  /** ms epoch: [start, end) */
  start: number
  end: number
  /** null for 'all' */
  previous: Bounds | null
}

/** Resolve a range to day keys + epoch bounds + the previous period of equal length. */
export function rangeBounds(range: AnalyticsRange, now: number, earliest?: number): Bounds {
  const today = dayKey(now)
  let from: string
  let to = today
  if (range === 'today') from = today
  else if (range === '7d') from = addDays(today, -6)
  else if (range === '30d') from = addDays(today, -29)
  else if (range === 'all') from = earliest ? dayKey(earliest) : today
  else {
    from = range.from
    to = range.to
  }
  if (from > to) from = to
  const start = dayStart(from)
  const end = dayStart(addDays(to, 1))
  const bounds: Bounds = { from, to, start, end, previous: null }
  if (range !== 'all') {
    const days = dayRange(from, to).length
    const pto = addDays(from, -1)
    const pfrom = addDays(from, -days)
    bounds.previous = { from: pfrom, to: pto, start: dayStart(pfrom), end: start, previous: null }
  }
  return bounds
}

export interface Filter {
  bounds: Bounds
  /** ProjectKey.key, or null for all projects */
  projectKey: string | null
}

export interface SessionRow extends SessionSummary {
  project: ProjectKey
  tokens: TokenCounts
  totalTokens: number
  costUsd: number | null
  /** Model with the most total tokens. */
  mainModel: string | null
  live: boolean
}

export interface DecorateOptions {
  projects: Pick<Project, 'id' | 'name' | 'path'>[]
  pricing?: Record<string, ModelPricing>
  home?: string
  liveSessionIds?: ReadonlySet<string>
}

/** Attach project, totals and cost to every session (once per data change, not per filter). */
export function decorateSessions(sessions: SessionSummary[], opts: DecorateOptions): SessionRow[] {
  return sessions.map((s) => {
    const tokens = Object.values(s.tokensByModel).reduce(addTokenCounts, ZERO_TOKENS)
    const { usd, unknownModels } = costOf(s.tokensByModel, opts.pricing)
    const known = Object.keys(s.tokensByModel).length - unknownModels.length
    let mainModel: string | null = null
    let best = -1
    for (const [m, t] of Object.entries(s.tokensByModel)) {
      const n = totalTokens(t)
      if (n > best) {
        best = n
        mainModel = m
      }
    }
    return {
      ...s,
      project: projectKeyFor(s.cwd, opts.projects, opts.home),
      tokens,
      totalTokens: totalTokens(tokens),
      costUsd: known > 0 || Object.keys(s.tokensByModel).length === 0 ? usd : null,
      mainModel,
      live: opts.liveSessionIds?.has(s.sessionId) ?? false
    }
  })
}

/** A session is in range when its conversation span overlaps [start, end). */
export function filterSessions(rows: SessionRow[], f: Filter): SessionRow[] {
  return rows.filter(
    (r) =>
      (f.projectKey === null || r.project.key === f.projectKey) &&
      r.lastTs >= f.bounds.start &&
      r.firstTs < f.bounds.end &&
      r.firstTs > 0
  )
}

/** Tokens of a row that fall inside the bounds (by day buckets, exact per message). */
export function tokensInBounds(r: SessionRow, b: Bounds): TokenCounts {
  let t = ZERO_TOKENS
  for (const [day, tk] of Object.entries(r.tokensByDay))
    if (day >= b.from && day <= b.to) t = addTokenCounts(t, tk)
  return t
}

export interface Summary {
  tokens: TokenCounts
  totalTokens: number
  costUsd: number
  sessions: number
  turns: number
  durationMs: number
  unknownModels: string[]
}

function summarizeRows(
  rows: SessionRow[],
  b: Bounds,
  pricing?: Record<string, ModelPricing>
): Summary {
  let tokens = ZERO_TOKENS
  const byModel: Record<string, TokenCounts> = {}
  let turns = 0
  let durationMs = 0
  for (const r of rows) {
    const t = tokensInBounds(r, b)
    tokens = addTokenCounts(tokens, t)
    turns += r.userTurns
    durationMs += r.durationMs
    // cost needs per-model tokens in range: approximate by the row's model mix applied to in-range tokens
    const rowTotal = r.totalTokens
    for (const [m, mt] of Object.entries(r.tokensByModel)) {
      const share = rowTotal > 0 ? totalTokens(mt) / rowTotal : 0
      const scaled: TokenCounts = {
        input: t.input * share,
        output: t.output * share,
        cacheWrite: t.cacheWrite * share,
        cacheRead: t.cacheRead * share
      }
      byModel[m] = addTokenCounts(byModel[m] ?? ZERO_TOKENS, scaled)
    }
  }
  const { usd, unknownModels } = costOf(byModel, pricing)
  return {
    tokens,
    totalTokens: totalTokens(tokens),
    costUsd: usd,
    sessions: rows.length,
    turns,
    durationMs,
    unknownModels
  }
}

export interface SummaryWithDelta extends Summary {
  /** Previous period (same length), or null for 'all'. */
  previous: Summary | null
}

export function summarize(
  all: SessionRow[],
  f: Filter,
  pricing?: Record<string, ModelPricing>
): SummaryWithDelta {
  const cur = summarizeRows(filterSessions(all, f), f.bounds, pricing)
  const prev = f.bounds.previous
    ? summarizeRows(
        filterSessions(all, { ...f, bounds: f.bounds.previous }),
        f.bounds.previous,
        pricing
      )
    : null
  return { ...cur, previous: prev }
}

/** Percent change, null when the previous value is 0 or missing. */
export function deltaPct(cur: number, prev: number | null | undefined): number | null {
  if (prev === null || prev === undefined || prev === 0) return null
  return ((cur - prev) / prev) * 100
}

export interface DayBucket {
  /** day key, or week-start key when bucketed by week */
  key: string
  byModel: Record<string, TokenCounts>
  total: TokenCounts
}

/** One bucket per day (or per ISO week when the range spans > 60 days); empty buckets included. */
export function byDay(
  rows: SessionRow[],
  b: Bounds
): { buckets: DayBucket[]; unit: 'day' | 'week' } {
  const days = dayRange(b.from, b.to)
  const unit: 'day' | 'week' = days.length > 60 ? 'week' : 'day'
  const keyOf = (day: string): string => (unit === 'day' ? day : weekStart(day))
  const order: string[] = []
  const map = new Map<string, DayBucket>()
  for (const d of days) {
    const k = keyOf(d)
    if (!map.has(k)) {
      map.set(k, { key: k, byModel: {}, total: ZERO_TOKENS })
      order.push(k)
    }
  }
  for (const r of rows) {
    const rowTotal = r.totalTokens
    for (const [day, tk] of Object.entries(r.tokensByDay)) {
      if (day < b.from || day > b.to) continue
      const bucket = map.get(keyOf(day))
      if (!bucket) continue
      bucket.total = addTokenCounts(bucket.total, tk)
      for (const [m, mt] of Object.entries(r.tokensByModel)) {
        const share = rowTotal > 0 ? totalTokens(mt) / rowTotal : 0
        const scaled: TokenCounts = {
          input: tk.input * share,
          output: tk.output * share,
          cacheWrite: tk.cacheWrite * share,
          cacheRead: tk.cacheRead * share
        }
        bucket.byModel[m] = addTokenCounts(bucket.byModel[m] ?? ZERO_TOKENS, scaled)
      }
    }
  }
  return { buckets: order.map((k) => map.get(k)!), unit }
}

export interface GroupStat {
  key: string
  label: string
  projectId: string | null
  tokens: TokenCounts
  totalTokens: number
  costUsd: number
  sessions: number
  share: number
}

export function byProject(
  rows: SessionRow[],
  b: Bounds,
  pricing?: Record<string, ModelPricing>
): GroupStat[] {
  const groups = new Map<string, { rows: SessionRow[]; project: ProjectKey }>()
  for (const r of rows) {
    const g = groups.get(r.project.key) ?? { rows: [], project: r.project }
    g.rows.push(r)
    groups.set(r.project.key, g)
  }
  const stats: GroupStat[] = []
  let grand = 0
  for (const [key, g] of groups) {
    const s = summarizeRows(g.rows, b, pricing)
    grand += s.totalTokens
    stats.push({
      key,
      label: g.project.label,
      projectId: g.project.projectId,
      tokens: s.tokens,
      totalTokens: s.totalTokens,
      costUsd: s.costUsd,
      sessions: g.rows.length,
      share: 0
    })
  }
  for (const s of stats) s.share = grand > 0 ? s.totalTokens / grand : 0
  return stats.sort((a, b2) => b2.totalTokens - a.totalTokens)
}

export interface ModelStat {
  model: string
  tokens: TokenCounts
  totalTokens: number
  costUsd: number | null
  share: number
}

export function byModel(
  rows: SessionRow[],
  b: Bounds,
  pricing?: Record<string, ModelPricing>
): ModelStat[] {
  const acc: Record<string, TokenCounts> = {}
  for (const r of rows) {
    const t = tokensInBounds(r, b)
    const rowTotal = r.totalTokens
    for (const [m, mt] of Object.entries(r.tokensByModel)) {
      const share = rowTotal > 0 ? totalTokens(mt) / rowTotal : 0
      acc[m] = addTokenCounts(acc[m] ?? ZERO_TOKENS, {
        input: t.input * share,
        output: t.output * share,
        cacheWrite: t.cacheWrite * share,
        cacheRead: t.cacheRead * share
      })
    }
  }
  const grand = Object.values(acc).reduce((n, t) => n + totalTokens(t), 0)
  return Object.entries(acc)
    .map(([model, tokens]) => {
      const { usd, unknownModels } = costOf({ [model]: tokens }, pricing)
      return {
        model,
        tokens,
        totalTokens: totalTokens(tokens),
        costUsd: unknownModels.length ? null : usd,
        share: grand > 0 ? totalTokens(tokens) / grand : 0
      }
    })
    .sort((a, b2) => b2.totalTokens - a.totalTokens)
}

/** [dow][hour] sums over the rows (their buckets are already in local time). */
export function heatmap(
  rows: SessionRow[],
  metric: 'turns' | 'tokens'
): { grid: number[][]; max: number } {
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))
  let max = 0
  for (const r of rows) {
    const src = metric === 'turns' ? r.turnsByHourDow : r.tokensByHourDow
    for (let d = 0; d < 7; d++)
      for (let h = 0; h < 24; h++) {
        const v = grid[d]![h]! + (src[d]?.[h] ?? 0)
        grid[d]![h] = v
        if (v > max) max = v
      }
  }
  return { grid, max }
}

export type SortKey =
  'title' | 'project' | 'firstTs' | 'duration' | 'turns' | 'tokens' | 'cost' | 'model'

export function sortSessions(rows: SessionRow[], key: SortKey, dir: 'asc' | 'desc'): SessionRow[] {
  const v = (r: SessionRow): string | number => {
    switch (key) {
      case 'title':
        return r.title.toLowerCase()
      case 'project':
        return r.project.label.toLowerCase()
      case 'firstTs':
        return r.firstTs
      case 'duration':
        return Math.max(0, r.lastTs - r.firstTs)
      case 'turns':
        return r.userTurns
      case 'tokens':
        return r.totalTokens
      case 'cost':
        return r.costUsd ?? -1
      case 'model':
        return r.mainModel ?? ''
    }
  }
  const sign = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const x = v(a)
    const y = v(b)
    if (x < y) return -sign
    if (x > y) return sign
    return b.firstTs - a.firstTs
  })
}
