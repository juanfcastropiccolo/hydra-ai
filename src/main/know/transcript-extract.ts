// Feature 006: a compact, recent extract of a transcript for card generation when the full
// conversation does not fit the model context ("Prompt is too long"). Human/assistant text only.
import { readFileSync } from 'node:fs'

export const EXTRACT_MAX_CHARS = 60_000

export function recentExtract(path: string, maxChars = EXTRACT_MAX_CHARS): string {
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return ''
  }
  const turns: string[] = []
  for (const line of raw.split('\n')) {
    if (!/"type":\s*"(?:user|assistant)"/.test(line)) continue
    let rec: unknown
    try {
      rec = JSON.parse(line)
    } catch {
      continue
    }
    const r = rec as { type?: string; isMeta?: boolean; message?: { content?: unknown } }
    if (r.isMeta) continue
    const c = r.message?.content
    const texts: string[] = []
    if (typeof c === 'string') texts.push(c)
    else if (Array.isArray(c))
      for (const b of c) {
        if (!b || typeof b !== 'object') continue
        const blk = b as {
          type?: string
          text?: string
          name?: string
          input?: { file_path?: string; command?: string }
        }
        if (blk.type === 'text' && blk.text) texts.push(blk.text)
        else if (blk.type === 'tool_use' && blk.name)
          texts.push(
            `[${blk.name}${blk.input?.file_path ? ' ' + blk.input.file_path : blk.input?.command ? ' ' + blk.input.command.slice(0, 120) : ''}]`
          )
      }
    const text = texts.join('\n').replace(/\s+\n/g, '\n').trim()
    if (!text) continue
    turns.push(`${r.type === 'user' ? 'USUARIO' : 'ASISTENTE'}: ${text.slice(0, 4000)}`)
  }
  // keep the most recent turns that fit
  const out: string[] = []
  let used = 0
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i]!
    if (used + t.length + 2 > maxChars) break
    out.unshift(t)
    used += t.length + 2
  }
  const dropped = turns.length - out.length
  return (dropped > 0 ? `[… ${dropped} turnos anteriores omitidos …]\n\n` : '') + out.join('\n\n')
}
