// Pure helpers that turn a raw handoff summary into the block pasted into the target pane.
import { HANDOFF_SECTIONS, PRIORITY_SECTIONS } from './handoff-prompt'

export const DEFAULT_MAX_CHARS = 8000
export const TRIM_MARK = '[… resumen recortado por Hydra por tamaño …]'

export interface TrimResult {
  text: string
  truncated: boolean
}

interface Section {
  title: string | null
  body: string
}

/** Split markdown into a preamble (title null) and `## ` sections. */
function splitSections(text: string): Section[] {
  const lines = text.split('\n')
  const out: Section[] = []
  let cur: Section = { title: null, body: '' }
  for (const line of lines) {
    const m = /^#{1,3}\s+(.+?)\s*$/.exec(line)
    if (m) {
      if (cur.title !== null || cur.body.trim()) out.push(cur)
      cur = { title: m[1] ?? '', body: line + '\n' }
    } else cur.body += line + '\n'
  }
  if (cur.title !== null || cur.body.trim()) out.push(cur)
  return out
}

const normalizeTitle = (t: string): string =>
  t
    .toLowerCase()
    .replace(/^\d+[.)]\s*/, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()

const isPriority = (title: string | null): boolean =>
  title !== null &&
  PRIORITY_SECTIONS.some((p) => normalizeTitle(title).startsWith(normalizeTitle(p)))
const isKnown = (title: string | null): boolean =>
  title !== null &&
  HANDOFF_SECTIONS.some((p) => normalizeTitle(title).startsWith(normalizeTitle(p)))

/**
 * Keep the summary under `max` chars. Below the cap: untouched. Above it: keep the preamble and
 * the priority sections first (objetivo, decisiones, estado, pendientes), then the rest, cutting
 * the last section that does not fit and appending TRIM_MARK. Without recognisable headings it
 * is a plain cut at a line boundary.
 */
export function trimSummary(text: string, max = DEFAULT_MAX_CHARS): TrimResult {
  const clean = text.replace(/\r\n?/g, '\n').trim()
  if (clean.length <= max) return { text: clean, truncated: false }
  const budget = max - TRIM_MARK.length - 2
  const sections = splitSections(clean)
  const hasKnown = sections.some((s) => isKnown(s.title))
  if (!hasKnown) return { text: cutAtLine(clean, budget) + '\n\n' + TRIM_MARK, truncated: true }

  const ordered = [
    ...sections.filter((s) => s.title === null),
    ...sections.filter((s) => isPriority(s.title)),
    ...sections.filter((s) => s.title !== null && !isPriority(s.title))
  ]
  let out = ''
  for (const s of ordered) {
    const chunk = s.body.replace(/\n+$/, '') + '\n\n'
    if (out.length + chunk.length <= budget) out += chunk
    else {
      const room = budget - out.length
      if (room > 80) out += cutAtLine(chunk, room) + '\n\n'
      break
    }
  }
  return { text: out.trimEnd() + '\n\n' + TRIM_MARK, truncated: true }
}

function cutAtLine(s: string, max: number): string {
  if (s.length <= max) return s
  const cut = s.slice(0, max)
  const nl = cut.lastIndexOf('\n')
  return (nl > max * 0.5 ? cut.slice(0, nl) : cut).trimEnd()
}

export interface ImportBlockInput {
  sourceName: string
  projectName: string | null
  text: string
  truncated: boolean
}

const attr = (s: string): string =>
  s
    .replace(/"/g, "'")
    .replace(/[\r\n]+/g, ' ')
    .trim()

/**
 * The block pasted into the target pane: a short intro in the user's own voice (FR-11 — an
 * imperative wrapper was rejected as prompt injection in spike 004) + the summary delimited by an
 * <imported-context> tag. Never contains '\r' so it cannot submit the prompt by itself.
 */
export function buildImportBlock(input: ImportBlockInput): string {
  const where = input.projectName ? ` (proyecto "${attr(input.projectName)}")` : ''
  const intro =
    `Te comparto, como contexto de referencia, el resumen de otra sesión mía de Claude Code llamada "${attr(input.sourceName)}"${where}. ` +
    'No hay que ejecutar nada: tenelo presente para lo que te pida después. ' +
    'Confirmá en una línea que lo leíste.' +
    (input.truncated ? ' (Resumen recortado por tamaño.)' : '')
  const tag = `<imported-context session="${attr(input.sourceName)}"${input.projectName ? ` project="${attr(input.projectName)}"` : ''}>`
  const body = input.text.replace(/\r\n?/g, '\n').trim()
  return `${intro}\n\n${tag}\n${body}\n</imported-context>`
}
