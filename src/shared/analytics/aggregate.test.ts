import { describe, expect, it } from 'vitest'
import {
  byDay,
  byModel,
  byProject,
  decorateSessions,
  deltaPct,
  filterSessions,
  heatmap,
  rangeBounds,
  sortSessions,
  summarize,
  type SessionRow
} from './aggregate'
import { addDays, dayKey, dayRange, dayStart, weekStart } from './time-buckets'
import { ZERO_TOKENS, type SessionSummary, type TokenCounts } from './types'

const grid = (): number[][] => Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))
const tk = (n: number): TokenCounts => ({ input: n, output: n, cacheWrite: 0, cacheRead: 0 })

// Fixed "now": 2026-08-23 15:00 local
const NOW = new Date(2026, 7, 23, 15, 0, 0).getTime()
const at = (daysAgo: number, hour = 10): number => {
  const d = new Date(2026, 7, 23 - daysAgo, hour, 0, 0)
  return d.getTime()
}

function mk(
  id: string,
  cwd: string,
  daysAgo: number,
  model: string,
  n: number,
  over: Partial<SessionSummary> = {}
): SessionSummary {
  const ts = at(daysAgo)
  const t = grid()
  const tokHD = grid()
  const d = new Date(ts)
  t[d.getDay()]![d.getHours()]! += 1
  tokHD[d.getDay()]![d.getHours()]! += 2 * n
  return {
    sessionId: id,
    cwd,
    title: `Session ${id}`,
    firstTs: ts,
    lastTs: ts + 60_000,
    userTurns: 1,
    assistantMsgs: 1,
    durationMs: 1000,
    tokensByModel: { [model]: tk(n) },
    tools: {},
    skippedLines: 0,
    subagents: 0,
    tokensByDay: { [dayKey(ts)]: tk(n) },
    turnsByHourDow: t,
    tokensByHourDow: tokHD,
    ...over
  }
}

const projects = [{ id: 'P1', name: 'Hydra', path: '/Users/u/hydra' }]
const sessions: SessionSummary[] = [
  mk('s0', '/Users/u/hydra', 0, 'claude-opus-5', 100), // today
  mk('s1', '/Users/u/hydra', 1, 'claude-opus-5', 200),
  mk('s2', '/Users/u/other', 3, 'claude-haiku-4-5-20251001', 1000),
  mk('s3', '/Users/u/hydra', 6, 'claude-opus-5', 50), // still inside 7d
  mk('s4', '/Users/u/hydra', 7, 'claude-opus-5', 400), // previous period (7d)
  mk('s5', '/Users/u/other', 10, 'mystery-model', 10),
  mk('s6', '/Users/u/hydra', 40, 'claude-opus-5', 5),
  mk('s7', '/Users/u/hydra', 0, 'claude-opus-5', 0, {
    firstTs: 0,
    lastTs: 0,
    tokensByDay: {},
    tokensByModel: {}
  }) // no timestamps → never in range
]
const rows = decorateSessions(sessions, {
  projects,
  home: '/Users/u',
  liveSessionIds: new Set(['s0'])
})

describe('time-buckets', () => {
  it('day math', () => {
    expect(dayKey(new Date(2026, 0, 5, 23).getTime())).toBe('2026-01-05')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(dayRange('2026-08-20', '2026-08-23')).toEqual([
      '2026-08-20',
      '2026-08-21',
      '2026-08-22',
      '2026-08-23'
    ])
    expect(weekStart('2026-08-23')).toBe('2026-08-17') // Sunday → previous Monday
    expect(weekStart('2026-08-17')).toBe('2026-08-17')
    expect(dayStart('2026-08-23')).toBe(new Date(2026, 7, 23).getTime())
  })
})

describe('rangeBounds', () => {
  it('presets and previous period', () => {
    const b7 = rangeBounds('7d', NOW)
    expect([b7.from, b7.to]).toEqual(['2026-08-17', '2026-08-23'])
    expect([b7.previous?.from, b7.previous?.to]).toEqual(['2026-08-10', '2026-08-16'])
    expect(rangeBounds('today', NOW).from).toBe('2026-08-23')
    expect(rangeBounds('30d', NOW).from).toBe('2026-07-25')
    const all = rangeBounds('all', NOW, at(40))
    expect(all.from).toBe('2026-07-14')
    expect(all.previous).toBeNull()
    const custom = rangeBounds({ from: '2026-08-01', to: '2026-08-10' }, NOW)
    expect(custom.previous).toEqual(
      expect.objectContaining({ from: '2026-07-22', to: '2026-07-31' })
    )
  })
})

describe('decorate + filter', () => {
  it('decorates with project, totals, cost, main model, live', () => {
    const r0 = rows.find((r) => r.sessionId === 's0')!
    expect(r0.project).toEqual({ key: 'P1', label: 'Hydra', projectId: 'P1' })
    expect(r0.totalTokens).toBe(200)
    expect(r0.costUsd).toBeCloseTo((100 * 5 + 100 * 25) / 1e6, 9)
    expect(r0.mainModel).toBe('claude-opus-5')
    expect(r0.live).toBe(true)
    const r2 = rows.find((r) => r.sessionId === 's2')!
    expect(r2.project.label).toBe('~/other')
    expect(rows.find((r) => r.sessionId === 's5')!.costUsd).toBeNull() // unknown model only
  })
  it('filters by overlap with the range and by project; sessions without timestamps are dropped', () => {
    const b = rangeBounds('7d', NOW)
    expect(filterSessions(rows, { bounds: b, projectKey: null }).map((r) => r.sessionId)).toEqual([
      's0',
      's1',
      's2',
      's3'
    ])
    expect(filterSessions(rows, { bounds: b, projectKey: 'P1' }).map((r) => r.sessionId)).toEqual([
      's0',
      's1',
      's3'
    ])
    expect(
      filterSessions(rows, { bounds: rangeBounds('today', NOW), projectKey: null }).map(
        (r) => r.sessionId
      )
    ).toEqual(['s0'])
  })
})

describe('summarize', () => {
  it('totals for the range and the previous period', () => {
    const s = summarize(rows, { bounds: rangeBounds('7d', NOW), projectKey: null })
    expect(s.sessions).toBe(4)
    expect(s.totalTokens).toBe(2 * (100 + 200 + 1000 + 50))
    expect(s.turns).toBe(4)
    expect(s.durationMs).toBe(4000)
    expect(s.unknownModels).toEqual([])
    expect(s.previous?.sessions).toBe(2) // s4 (7 days ago) and s5 (10 days ago)
    expect(s.previous?.unknownModels).toEqual(['mystery-model'])
    expect(deltaPct(s.totalTokens, s.previous?.totalTokens)).toBeCloseTo(
      ((2700 - 820) / 820) * 100,
      6
    )
    expect(deltaPct(1, 0)).toBeNull()
    expect(
      summarize(rows, { bounds: rangeBounds('all', NOW, at(40)), projectKey: null }).previous
    ).toBeNull()
  })
})

describe('byDay / byProject / byModel / heatmap', () => {
  const b = rangeBounds('7d', NOW)
  const inRange = filterSessions(rows, { bounds: b, projectKey: null })
  it('byDay has one bucket per day, empty days included, stacked by model', () => {
    const { buckets, unit } = byDay(inRange, b)
    expect(unit).toBe('day')
    expect(buckets.map((x) => x.key)).toEqual(dayRange('2026-08-17', '2026-08-23'))
    expect(buckets[6]!.total.input).toBe(100) // today: s0
    expect(buckets[3]!.total.input).toBe(1000) // 3 days ago: s2 (haiku)
    expect(Object.keys(buckets[3]!.byModel)).toEqual(['claude-haiku-4-5-20251001'])
    expect(buckets[1]!.total).toEqual(ZERO_TOKENS) // empty day
  })
  it('byDay switches to weeks beyond 60 days', () => {
    const wide = rangeBounds({ from: '2026-06-01', to: '2026-08-23' }, NOW)
    const { buckets, unit } = byDay(filterSessions(rows, { bounds: wide, projectKey: null }), wide)
    expect(unit).toBe('week')
    expect(buckets[0]!.key).toBe('2026-06-01') // a Monday
    expect(buckets.at(-1)!.key).toBe('2026-08-17')
  })
  it('byProject orders by usage, labels Hydra projects by name and others by path, computes share', () => {
    const g = byProject(inRange, b)
    expect(g.map((x) => [x.label, x.totalTokens, x.sessions])).toEqual([
      ['~/other', 2000, 1],
      ['Hydra', 700, 3]
    ])
    expect(g[0]!.share).toBeCloseTo(2000 / 2700, 6)
    expect(g[1]!.projectId).toBe('P1')
  })
  it('byModel sums and prices per model', () => {
    const m = byModel(inRange, b)
    expect(m.map((x) => [x.model, x.totalTokens])).toEqual([
      ['claude-haiku-4-5-20251001', 2000],
      ['claude-opus-5', 700]
    ])
    expect(m[1]!.costUsd).toBeCloseTo((350 * 5 + 350 * 25) / 1e6, 9)
  })
  it('heatmap sums cells', () => {
    const h = heatmap(inRange, 'turns')
    const total = h.grid.flat().reduce((a, c) => a + c, 0)
    expect(total).toBe(4)
    expect(h.max).toBeGreaterThanOrEqual(1)
    expect(
      heatmap(inRange, 'tokens')
        .grid.flat()
        .reduce((a, c) => a + c, 0)
    ).toBe(2700)
  })
})

describe('sortSessions', () => {
  it('sorts by each key with a stable tiebreak', () => {
    const ids = (k: Parameters<typeof sortSessions>[1], d: 'asc' | 'desc'): string[] =>
      sortSessions(rows, k, d).map((r) => r.sessionId)
    expect(ids('tokens', 'desc')[0]).toBe('s2')
    expect(ids('cost', 'asc')[0]).toBe('s5') // null cost first
    expect(ids('firstTs', 'desc').slice(0, 2)).toEqual(['s0', 's1'])
    expect(ids('project', 'asc')[0]).toMatch(/s0|s1|s3|s4|s6|s7/)
    expect(ids('title', 'asc')[0]).toBe('s0')
    const x: SessionRow = rows[0]!
    expect(x.project.label).toBe('Hydra')
  })
})
