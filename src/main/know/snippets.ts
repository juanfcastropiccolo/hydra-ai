// Feature 006: on-demand snippet extraction — re-read one transcript and return the best matching
// human-visible line. Only called for the top-k of a search, so a linear pass is fine.
import { readFileSync } from 'node:fs'
import { tokenize } from './term-bag'

const MAX_BYTES = 4 * 1024 * 1024 // beyond this, read only the tail

export function snippetFromTranscript(path: string, terms: string[]): string | null {
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
    if (raw.length > MAX_BYTES) raw = raw.slice(-MAX_BYTES)
  } catch {
    return null
  }
  let best: { score: number; text: string } | null = null
  for (const line of raw.split('\n')) {
    if (!line.includes('"type":"user"') && !line.includes('"type":"assistant"')) continue
    let rec: unknown
    try {
      rec = JSON.parse(line)
    } catch {
      continue
    }
    const r = rec as { isMeta?: boolean; message?: { content?: unknown } }
    if (r.isMeta) continue
    const c = r.message?.content
    const texts: string[] = []
    if (typeof c === 'string') texts.push(c)
    else if (Array.isArray(c))
      for (const b of c)
        if (b && typeof b === 'object' && (b as { type?: string }).type === 'text')
          texts.push(String((b as { text?: string }).text ?? ''))
    for (const t of texts) {
      const toks = new Set(tokenize(t))
      const score = terms.filter((x) => toks.has(x)).length
      if (score > 0 && (!best || score > best.score)) {
        const idx = t.toLowerCase().indexOf(terms[0] ?? '')
        const start = Math.max(0, idx - 80)
        best = {
          score,
          text: t
            .replace(/\s+/g, ' ')
            .slice(start, start + 300)
            .trim()
        }
      }
    }
  }
  return best ? (best.text.length >= 300 ? `…${best.text}…` : best.text) : null
}
