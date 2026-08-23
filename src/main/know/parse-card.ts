// Feature 006: tolerant parser for the card JSON coming back from `claude -p` (FR-17).
import type { Fact, FactKind, SessionCard } from '@shared/know/types'
import { CARD_MAX_FACTS } from './card-prompt'

const KINDS: FactKind[] = ['decision', 'dato', 'estado', 'pendiente']
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

export interface ParsedCard {
  summary: string
  facts: Array<Pick<Fact, 'text' | 'kind' | 'entities'>>
  supersededIds: string[]
}

/** Extract the card JSON from model output (may be wrapped in prose/fences). Null when hopeless. */
export function parseCard(text: string): ParsedCard | null {
  const candidates: string[] = []
  const trimmed = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')
  candidates.push(trimmed)
  const first = trimmed.indexOf('{')
  const last = trimmed.lastIndexOf('}')
  if (first >= 0 && last > first) candidates.push(trimmed.slice(first, last + 1))
  for (const c of candidates) {
    let v: unknown
    try {
      v = JSON.parse(c)
    } catch {
      continue
    }
    if (!isRecord(v)) continue
    const summary = typeof v.summary === 'string' ? v.summary.trim() : ''
    const rawFacts = Array.isArray(v.facts) ? v.facts : []
    const facts: ParsedCard['facts'] = []
    for (const f of rawFacts) {
      if (!isRecord(f) || typeof f.text !== 'string' || !f.text.trim()) continue
      const kind = KINDS.includes(f.kind as FactKind) ? (f.kind as FactKind) : 'dato'
      const entities = Array.isArray(f.entities)
        ? f.entities
            .filter((e): e is string => typeof e === 'string' && e.trim().length > 0)
            .map((e) => e.trim())
            .slice(0, 5)
        : []
      facts.push({ text: f.text.trim(), kind, entities })
      if (facts.length >= CARD_MAX_FACTS) break
    }
    const supersededIds = Array.isArray(v.superseded_ids)
      ? v.superseded_ids.filter((x): x is string => typeof x === 'string')
      : []
    if (!summary && facts.length === 0) continue
    return { summary, facts, supersededIds }
  }
  return null
}

/** Turn a parsed card into the stored SessionCard (ids assigned here). */
export function toSessionCard(
  parsed: ParsedCard,
  opts: {
    sessionId: string
    sourceLastTs: number
    model: string
    generatedAt: number
    costUsd?: number
    partial?: boolean
  }
): SessionCard {
  const facts: Fact[] = parsed.facts.map((f, i) => ({
    id: `${opts.sessionId}#${i + 1}`,
    text: f.text,
    kind: f.kind,
    entities: f.entities,
    ts: opts.sourceLastTs
  }))
  const card: SessionCard = {
    summary: parsed.summary,
    facts,
    generatedAt: opts.generatedAt,
    sourceLastTs: opts.sourceLastTs,
    model: opts.model
  }
  if (opts.costUsd !== undefined) card.costUsd = opts.costUsd
  if (opts.partial) card.partial = true
  return card
}
