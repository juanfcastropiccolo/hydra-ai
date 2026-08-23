// Feature 005: pure, line-by-line reducer over a Claude Code transcript (.jsonl). The state is
// plain JSON (it is cached to disk and resumed from a byte offset), so no Sets/Maps.
//
// Facts about the format this relies on (see test/fixtures/transcripts/README.md):
//  - one API response is split into several `assistant` records (thinking / text / tool_use),
//    all carrying the same `message.id` and the same `usage` → count usage once per message id;
//  - `user` records are human turns only when they are not `isMeta` and their content is text
//    (a `tool_result` array is the tool output echoed back);
//  - `system` / `turn_duration` carries `durationMs` for one completed turn;
//  - titles: `custom-title` > `ai-title` > first human prompt.
import type { SessionSummary, TokenCounts } from '@shared/analytics/types'

export interface TranscriptState {
  cwd: string | null
  gitBranch: string | null
  customTitle: string | null
  aiTitle: string | null
  firstPrompt: string | null
  firstTs: number
  lastTs: number
  userTurns: number
  /** message.id values already counted (kept small: ids are ~30 chars, a few hundred per session). */
  seenMessageIds: string[]
  assistantMsgs: number
  durationMs: number
  tokensByModel: Record<string, TokenCounts>
  tools: Record<string, number>
  skippedLines: number
  tokensByDay: Record<string, TokenCounts>
  turnsByHourDow: number[][]
  tokensByHourDow: number[][]
}

export interface ReduceOptions {
  /** Local-time bucketing; defaults to the process time zone. Tests inject 'UTC'. */
  timeZone?: string
}

const grid = (): number[][] => Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))

export function emptyState(): TranscriptState {
  return {
    cwd: null,
    gitBranch: null,
    customTitle: null,
    aiTitle: null,
    firstPrompt: null,
    firstTs: 0,
    lastTs: 0,
    userTurns: 0,
    seenMessageIds: [],
    assistantMsgs: 0,
    durationMs: 0,
    tokensByModel: {},
    tools: {},
    skippedLines: 0,
    tokensByDay: {},
    turnsByHourDow: grid(),
    tokensByHourDow: grid()
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/** 'YYYY-MM-DD', weekday (0=Sun) and hour in `timeZone`. */
export function localParts(
  ts: number,
  timeZone?: string
): { day: string; dow: number; hour: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    weekday: 'short'
  })
  const parts = Object.fromEntries(fmt.formatToParts(new Date(ts)).map((p) => [p.type, p.value]))
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  const hour = Number(parts.hour) % 24 // some ICU versions print 24 for midnight
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    dow: dowMap[parts.weekday ?? ''] ?? 0,
    hour
  }
}

function addTokens(into: Record<string, TokenCounts>, key: string, t: TokenCounts): void {
  const cur = into[key] ?? { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 }
  into[key] = {
    input: cur.input + t.input,
    output: cur.output + t.output,
    cacheWrite: cur.cacheWrite + t.cacheWrite,
    cacheRead: cur.cacheRead + t.cacheRead
  }
}

function tokensOf(usage: unknown): TokenCounts | null {
  if (!isRecord(usage)) return null
  return {
    input: num(usage.input_tokens),
    output: num(usage.output_tokens),
    cacheWrite: num(usage.cache_creation_input_tokens),
    cacheRead: num(usage.cache_read_input_tokens)
  }
}

function isHumanTurn(rec: Record<string, unknown>): { text: string } | null {
  if (rec.isMeta === true) return null
  const msg = rec.message
  if (!isRecord(msg)) return null
  const c = msg.content
  if (typeof c === 'string') return { text: c }
  if (Array.isArray(c)) {
    if (c.some((b) => isRecord(b) && b.type === 'tool_result')) return null
    const text = c.find((b) => isRecord(b) && b.type === 'text' && typeof b.text === 'string') as
      { text: string } | undefined
    return { text: text?.text ?? '' }
  }
  return null
}

/** Mutates and returns `state`. Never throws: anything unexpected counts as a skipped line. */
export function reduceTranscriptLine(
  state: TranscriptState,
  line: string,
  opts: ReduceOptions = {}
): TranscriptState {
  const trimmed = line.trim()
  if (!trimmed) return state
  let rec: unknown
  try {
    rec = JSON.parse(trimmed)
  } catch {
    state.skippedLines++
    return state
  }
  if (!isRecord(rec)) {
    state.skippedLines++
    return state
  }
  if (!state.cwd && typeof rec.cwd === 'string' && rec.cwd) state.cwd = rec.cwd
  if (!state.gitBranch && typeof rec.gitBranch === 'string' && rec.gitBranch)
    state.gitBranch = rec.gitBranch
  const ts = typeof rec.timestamp === 'string' ? Date.parse(rec.timestamp) : NaN
  const type = rec.type

  switch (type) {
    case 'user': {
      const turn = isHumanTurn(rec)
      if (turn) {
        state.userTurns++
        if (state.firstPrompt === null && turn.text.trim()) state.firstPrompt = turn.text.trim()
        if (!Number.isNaN(ts)) {
          const { dow, hour } = localParts(ts, opts.timeZone)
          state.turnsByHourDow[dow]![hour]!++
        }
      }
      if (!Number.isNaN(ts)) touchTs(state, ts)
      return state
    }
    case 'assistant': {
      const msg = rec.message
      if (!Number.isNaN(ts)) touchTs(state, ts)
      if (!isRecord(msg)) return state
      const content = Array.isArray(msg.content) ? msg.content : []
      for (const block of content)
        if (isRecord(block) && block.type === 'tool_use' && typeof block.name === 'string')
          state.tools[block.name] = (state.tools[block.name] ?? 0) + 1
      const id = typeof msg.id === 'string' ? msg.id : null
      if (id && state.seenMessageIds.includes(id)) return state // same response, another block
      if (id) state.seenMessageIds.push(id)
      const tokens = tokensOf(msg.usage)
      if (!tokens) return state
      state.assistantMsgs++
      const model = typeof msg.model === 'string' && msg.model ? msg.model : 'unknown'
      addTokens(state.tokensByModel, model, tokens)
      if (!Number.isNaN(ts)) {
        const { day, dow, hour } = localParts(ts, opts.timeZone)
        addTokens(state.tokensByDay, day, tokens)
        state.tokensByHourDow[dow]![hour]! +=
          tokens.input + tokens.output + tokens.cacheWrite + tokens.cacheRead
      }
      return state
    }
    case 'system': {
      if (rec.subtype === 'turn_duration') state.durationMs += num(rec.durationMs)
      return state
    }
    case 'ai-title':
      if (typeof rec.aiTitle === 'string' && rec.aiTitle.trim()) state.aiTitle = rec.aiTitle.trim()
      return state
    case 'custom-title':
      if (typeof rec.customTitle === 'string' && rec.customTitle.trim())
        state.customTitle = rec.customTitle.trim()
      return state
    default:
      return state // attachments, modes, snapshots, queue ops… known but irrelevant
  }
}

function touchTs(state: TranscriptState, ts: number): void {
  if (!state.firstTs || ts < state.firstTs) state.firstTs = ts
  if (ts > state.lastTs) state.lastTs = ts
}

const TITLE_MAX = 80

/** Merge `subagents` (already reduced) into `state` and produce the summary sent to the renderer. */
export function finalizeSession(
  state: TranscriptState,
  opts: { sessionId: string; subagents?: TranscriptState[] }
): SessionSummary {
  const subs = opts.subagents ?? []
  const tokensByModel: Record<string, TokenCounts> = {}
  const tokensByDay: Record<string, TokenCounts> = {}
  const tools: Record<string, number> = {}
  const turnsByHourDow = grid()
  const tokensByHourDow = grid()
  let assistantMsgs = 0
  let skipped = 0
  for (const s of [state, ...subs]) {
    for (const [m, t] of Object.entries(s.tokensByModel)) addTokens(tokensByModel, m, t)
    for (const [d, t] of Object.entries(s.tokensByDay)) addTokens(tokensByDay, d, t)
    for (const [n, c] of Object.entries(s.tools)) tools[n] = (tools[n] ?? 0) + c
    for (let d = 0; d < 7; d++)
      for (let h = 0; h < 24; h++) {
        turnsByHourDow[d]![h]! += s.turnsByHourDow[d]?.[h] ?? 0
        tokensByHourDow[d]![h]! += s.tokensByHourDow[d]?.[h] ?? 0
      }
    assistantMsgs += s.assistantMsgs
    skipped += s.skippedLines
  }
  // Strip XML-ish wrappers (slash commands, system reminders) so fallback titles stay readable.
  const prompt = (state.firstPrompt ?? '')
    .replace(/<[^>]{1,60}>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const title =
    state.customTitle ??
    state.aiTitle ??
    (prompt
      ? prompt.length > TITLE_MAX
        ? prompt.slice(0, TITLE_MAX - 1) + '…'
        : prompt
      : opts.sessionId)
  const out: SessionSummary = {
    sessionId: opts.sessionId,
    cwd: state.cwd ?? '',
    title,
    firstTs: state.firstTs,
    lastTs: Math.max(state.lastTs, ...subs.map((s) => s.lastTs)),
    userTurns: state.userTurns, // sub-agent "users" are Claude's own sub-tasks, not the human
    assistantMsgs,
    durationMs: state.durationMs,
    tokensByModel,
    tools,
    skippedLines: skipped,
    subagents: subs.length,
    tokensByDay,
    turnsByHourDow,
    tokensByHourDow
  }
  if (state.gitBranch) out.gitBranch = state.gitBranch
  return out
}
