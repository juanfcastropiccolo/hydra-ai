// Parser/validator for `claude agents --json`. Isolated so a CLI format change breaks a test, not the app.
// Vocabulary observed on 2026-08-23 (Claude Code 2.1.241):
//  - kind "interactive": status "idle" | "busy"; no id, no state
//  - kind "background":  status "working" | "waiting" | "idle"; state "working" | "blocked" | "done" | "failed" | "stopped";
//                        waitingFor when status === "waiting" (e.g. "permission prompt", "input needed")

export interface AgentEntry {
  cwd: string
  kind: 'background' | 'interactive'
  startedAt: number
  pid?: number
  id?: string
  sessionId?: string
  name?: string
  status?: string
  state?: string
  waitingFor?: string
}

export interface ParseAgentsResult {
  entries: AgentEntry[]
  /** Non-fatal: set when the output could not be parsed; entries is then []. */
  error?: string
  /** Entries that were present but failed validation (logged, skipped). */
  skipped: number
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function toEntry(v: unknown): AgentEntry | null {
  if (!isRecord(v)) return null
  const { cwd, kind, startedAt, pid, id, sessionId, name, status, state, waitingFor } = v
  if (typeof cwd !== 'string' || !cwd) return null
  if (kind !== 'background' && kind !== 'interactive') return null
  if (typeof startedAt !== 'number') return null
  const e: AgentEntry = { cwd, kind, startedAt }
  if (typeof pid === 'number') e.pid = pid
  if (typeof id === 'string') e.id = id
  if (typeof sessionId === 'string') e.sessionId = sessionId
  if (typeof name === 'string') e.name = name
  if (typeof status === 'string') e.status = status
  if (typeof state === 'string') e.state = state
  if (typeof waitingFor === 'string') e.waitingFor = waitingFor
  return e
}

/** Extract the JSON array even if the CLI printed banner lines before it. */
function extractJsonArray(raw: string): string | null {
  const start = raw.indexOf('[')
  const end = raw.lastIndexOf(']')
  if (start === -1 || end === -1 || end < start) return null
  return raw.slice(start, end + 1)
}

export function parseAgentsJson(raw: string): ParseAgentsResult {
  const text = extractJsonArray(raw ?? '')
  if (text === null) return { entries: [], skipped: 0, error: 'no JSON array in output' }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    return { entries: [], skipped: 0, error: `invalid JSON: ${(e as Error).message}` }
  }
  if (!Array.isArray(parsed)) return { entries: [], skipped: 0, error: 'top-level is not an array' }
  const entries: AgentEntry[] = []
  let skipped = 0
  for (const item of parsed) {
    const e = toEntry(item)
    if (e) entries.push(e)
    else skipped++
  }
  return { entries, skipped }
}
