// Pure parser for the stdout of `claude -p --output-format json` (one JSON object; the CLI may
// print noise around it). Kept separate from ClaudeCli so the format can be pinned with fixtures.

export interface PrintJsonOk {
  ok: true
  text: string
  sessionId?: string
  costUsd?: number
  durationMs?: number
}
export interface PrintJsonErr {
  ok: false
  /** Human-readable reason (the CLI's own message when it gave one). */
  message: string
  /** 'is_error' = CLI reported an error; 'invalid' = no parseable result; 'empty' = no text. */
  kind: 'is_error' | 'invalid' | 'empty'
}
export type PrintJsonResult = PrintJsonOk | PrintJsonErr

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Find the last top-level `{...}` in `stdout` that parses as JSON (tolerates leading/trailing noise). */
function extractJsonObject(stdout: string): Record<string, unknown> | null {
  const trimmed = stdout.trim()
  if (!trimmed) return null
  try {
    const v: unknown = JSON.parse(trimmed)
    if (isRecord(v)) return v
  } catch {
    /* fall through */
  }
  // Scan for the last '{' … matching '}' region that parses.
  let end = trimmed.lastIndexOf('}')
  while (end > 0) {
    let start = trimmed.lastIndexOf('{', end)
    while (start >= 0) {
      try {
        const v: unknown = JSON.parse(trimmed.slice(start, end + 1))
        if (isRecord(v) && ('result' in v || 'is_error' in v || v.type === 'result')) return v
      } catch {
        /* keep scanning */
      }
      start = trimmed.lastIndexOf('{', start - 1)
    }
    end = trimmed.lastIndexOf('}', end - 1)
  }
  return null
}

export function parsePrintJson(stdout: string, stderr = ''): PrintJsonResult {
  const obj = extractJsonObject(stdout)
  if (!obj) {
    const msg = stderr.trim() || stdout.trim()
    return {
      ok: false,
      kind: 'invalid',
      message: msg ? firstLine(msg) : 'claude -p no devolvió ningún resultado'
    }
  }
  const text = typeof obj.result === 'string' ? obj.result.trim() : ''
  if (obj.is_error === true) {
    return {
      ok: false,
      kind: 'is_error',
      message: text || firstLine(stderr.trim()) || 'claude -p reportó un error sin detalle'
    }
  }
  if (!text) return { ok: false, kind: 'empty', message: 'El resumen llegó vacío' }
  const out: PrintJsonOk = { ok: true, text }
  if (typeof obj.session_id === 'string') out.sessionId = obj.session_id
  if (typeof obj.total_cost_usd === 'number') out.costUsd = obj.total_cost_usd
  if (typeof obj.duration_ms === 'number') out.durationMs = obj.duration_ms
  return out
}

function firstLine(s: string): string {
  const line = s.split('\n').find((l) => l.trim()) ?? s
  return line.trim().slice(0, 300)
}
