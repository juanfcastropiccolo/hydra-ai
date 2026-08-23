import { describe, expect, it } from 'vitest'
import type { Fact, SessionKnowledge } from '@shared/know/types'
import { buildSearchIndex, searchKnow, OUTPUT_BUDGET_CHARS, type KnowCorpus } from './know-search'

const fact = (id: string, text: string, entities: string[], over: Partial<Fact> = {}): Fact => ({
  id,
  text,
  kind: 'decision',
  entities,
  ts: 1,
  ...over
})
const sess = (
  id: string,
  title: string,
  bag: Record<string, number>,
  over: Partial<SessionKnowledge> = {},
  meta: Partial<{ projectKey: string; firstTs: number; lastTs: number }> = {}
): [string, { meta: never; k: SessionKnowledge }] =>
  [
    id,
    {
      meta: {
        sessionId: id,
        title,
        cwd: `/p/${id}`,
        projectKey: meta.projectKey ?? 'P',
        projectLabel: 'Proy',
        firstTs: meta.firstTs ?? Date.parse('2026-08-20T10:00:00Z'),
        lastTs: meta.lastTs ?? Date.parse('2026-08-20T11:00:00Z')
      },
      k: { termBag: bag, files: {}, commands: [], ...over }
    }
  ] as never

function corpus(): KnowCorpus {
  return {
    sessions: new Map([
      // A: touched the auth file, has a decision fact about tokens (multi-hop target)
      sess(
        'A',
        'Sesión auth',
        { auth: 3, sesion: 1 },
        {
          files: { '/p/src/auth/login.ts': 3 },
          card: {
            summary: 'Se trabajó auth',
            facts: [
              fact('A#1', 'Se decidió usar tokens JWT con expiración corta', [
                'src/auth/login.ts',
                'jwt'
              ]),
              fact('A#0', 'Se usaban cookies de sesión', ['jwt'], { supersededBy: 'A#1' })
            ],
            generatedAt: 1,
            sourceLastTs: 1,
            model: 'haiku'
          }
        }
      ),
      // B: mentions auth a lot in text but no card
      sess('B', 'Charla auth', { auth: 10, charla: 2 }),
      // C: unrelated
      sess('C', 'Otra cosa', { grafo: 5 })
    ])
  }
}

describe('searchKnow', () => {
  const ix = buildSearchIndex(corpus())
  it('AC-2 multi-hop: searching by file name surfaces the session and its decision', () => {
    const hits = searchKnow(ix, { query: 'login.ts' })
    expect(hits[0]?.sessionId).toBe('A')
    expect(hits[0]?.facts.map((f) => f.id)).toContain('A#1')
  })
  it('AC-4: vigente first, superseded listed as replaced', () => {
    const hits = searchKnow(ix, { query: 'jwt' })
    const a = hits.find((h) => h.sessionId === 'A')!
    expect(a.facts.map((f) => f.id)).toEqual(['A#1'])
    expect(a.replaced.map((f) => f.id)).toEqual(['A#0'])
  })
  it('AC-5 no card: falls back to snippet provider', () => {
    const hits = searchKnow(
      ix,
      { query: 'auth' },
      { snippetFor: (id) => (id === 'B' ? 'linea con auth' : null) }
    )
    const b = hits.find((h) => h.sessionId === 'B')!
    expect(b.facts).toEqual([])
    expect(b.snippet).toBe('linea con auth')
  })
  it('filters: project, dates, exclude; empty query → empty', () => {
    expect(searchKnow(ix, { query: '' })).toEqual([])
    expect(
      searchKnow(ix, { query: 'auth', excludeSessionId: 'A' }).map((h) => h.sessionId)
    ).not.toContain('A')
    expect(searchKnow(ix, { query: 'auth', projectKey: 'OTRO' })).toEqual([])
    expect(searchKnow(ix, { query: 'auth', from: '2026-08-21' })).toEqual([])
    expect(searchKnow(ix, { query: 'auth', to: '2026-08-19' })).toEqual([])
  })
  it('respects the output budget', () => {
    const big: KnowCorpus = { sessions: new Map() }
    for (let i = 0; i < 30; i++) {
      const [id, v] = sess(
        `S${i}`,
        'T'.repeat(200),
        { tema: 5 },
        {
          card: {
            summary: 'x'.repeat(400),
            facts: [fact(`S${i}#1`, 'tema '.repeat(60), ['tema'])],
            generatedAt: 1,
            sourceLastTs: 1,
            model: 'h'
          }
        }
      )
      big.sessions.set(id, v as never)
    }
    const hits = searchKnow(buildSearchIndex(big), { query: 'tema', limit: 20 })
    expect(hits.length).toBeGreaterThan(0)
    expect(JSON.stringify(hits).length).toBeLessThan(OUTPUT_BUDGET_CHARS * 1.3)
    expect(hits.length).toBeLessThan(20)
  })
  it('marks live sessions', () => {
    const hits = searchKnow(ix, { query: 'auth' }, { liveSessionIds: new Set(['A']) })
    expect(hits.find((h) => h.sessionId === 'A')?.live).toBe(true)
  })
})
