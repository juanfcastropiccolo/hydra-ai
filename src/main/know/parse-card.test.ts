import { describe, expect, it } from 'vitest'
import { buildCardPrompt } from './card-prompt'
import { parseCard, toSessionCard } from './parse-card'

describe('buildCardPrompt', () => {
  it('names the schema and includes existing facts for supersede', () => {
    const p = buildCardPrompt([{ id: 'a#1', text: 'viejo hecho' }])
    expect(p).toContain('superseded_ids')
    expect(p).toContain('- a#1: viejo hecho')
    expect(buildCardPrompt([])).not.toContain('vigentes registrados')
  })
})

describe('parseCard', () => {
  const clean = JSON.stringify({
    summary: 'Se arregló el watcher',
    facts: [
      { text: 'Se decidió usar debounce de 3 s', kind: 'decision', entities: ['watcher'] },
      { text: 'Falta cubrir el caso X', kind: 'pendiente', entities: [] }
    ],
    superseded_ids: ['b#2']
  })
  it('parses clean JSON, JSON in prose and fenced JSON', () => {
    for (const raw of [
      clean,
      `Acá está el análisis:\n${clean}\nListo.`,
      '```json\n' + clean + '\n```'
    ]) {
      const c = parseCard(raw)!
      expect(c.summary).toMatch(/watcher/)
      expect(c.facts).toHaveLength(2)
      expect(c.supersededIds).toEqual(['b#2'])
    }
  })
  it('tolerates missing/invalid fields and caps entities', () => {
    const c = parseCard(
      JSON.stringify({
        summary: 's',
        facts: [
          { text: 'ok', kind: 'raro', entities: ['a', 'b', 'c', 'd', 'e', 'f', 2] },
          { text: '' },
          'nope'
        ]
      })
    )!
    expect(c.facts).toHaveLength(1)
    expect(c.facts[0]).toEqual({ text: 'ok', kind: 'dato', entities: ['a', 'b', 'c', 'd', 'e'] })
    expect(c.supersededIds).toEqual([])
  })
  it('null on hopeless output', () => {
    expect(parseCard('no hay json acá')).toBeNull()
    expect(parseCard('{"otra": true}')).toBeNull()
  })
  it('toSessionCard assigns stable ids and timestamps', () => {
    const card = toSessionCard(parseCard(clean)!, {
      sessionId: 'S',
      sourceLastTs: 123,
      model: 'haiku',
      generatedAt: 456,
      costUsd: 0.01
    })
    expect(card.facts.map((f) => f.id)).toEqual(['S#1', 'S#2'])
    expect(card.facts[0]).toMatchObject({ ts: 123, kind: 'decision' })
    expect(card).toMatchObject({
      sourceLastTs: 123,
      generatedAt: 456,
      model: 'haiku',
      costUsd: 0.01
    })
  })
})
