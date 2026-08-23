// Feature 006: tokenizer + term bags for the lexical index. Pure. Spanish+English aware, keeps
// code-ish tokens (paths, camelCase symbols) searchable both whole and by parts.

const STOP = new Set(
  (
    'a al algo ante antes como con cual cuando de del desde donde dos el ella ellas ellos en entre era eran es esa ese eso esta este esto estos estas fue ha han hasta hay la las le les lo los mas más me mi mientras muy no nos o os otra otro para pero poco por porque que qué se sea ser si sí sin sobre son su sus te tiene tienen todo también tras tu un una uno unos unas y ya yo ' +
    'a about after all also an and any are as at be because been before being but by can could did do does doing done for from had has have having he her here hers him his how i if in into is it its just like me more most my no nor not of off on once only or other our out over own same she should so some such than that the their them then there these they this those through to too under until up very was we were what when where which while who whom why will with without would you your yours'
  )
    .split(/\s+/)
    .filter(Boolean)
)

const strip = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * Tokens for a piece of text. Path-like tokens (contain '/') and dotted names are kept whole AND
 * split into parts; camelCase/snake_case identifiers contribute their parts too. Pure words go
 * through stopword filtering; bare numbers are dropped. Every token is NFD-stripped lowercase.
 */
export function tokenize(text: string): string[] {
  const out: string[] = []
  const push = (t: string): void => {
    if (t.length < 2 || t.length > 64) return
    if (/^\d+$/.test(t)) return
    if (STOP.has(t)) return
    out.push(t)
  }
  // raw word-ish chunks: keep /, ., _, - inside
  for (const m of text.matchAll(/[\p{L}\p{N}_./-]+/gu)) {
    const raw = m[0].replace(/^[./-]+|[./-]+$/g, '')
    if (!raw) continue
    const low = strip(raw)
    const isPathish = raw.includes('/') || /\.\w{1,10}$/.test(raw)
    if (isPathish) push(low)
    // parts: split on separators and camelCase humps
    for (const part of raw.split(/[/._-]+/)) {
      const sub = part.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/\s+/)
      for (const w of sub) push(strip(w))
    }
  }
  return out
}

export type TermBag = Record<string, number>

export function addToBag(bag: TermBag, text: string, weight = 1): void {
  for (const t of tokenize(text)) bag[t] = (bag[t] ?? 0) + weight
}

/** Keep the top `max` terms by frequency (stable-ish: freq desc, then alpha). */
export function capBag(bag: TermBag, max: number): TermBag {
  const entries = Object.entries(bag)
  if (entries.length <= max) return bag
  entries.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
  return Object.fromEntries(entries.slice(0, max))
}
