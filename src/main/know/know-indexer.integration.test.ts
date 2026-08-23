// Integration (006): KnowIndexer over the real fixtures through a real AnalyticsIndexer.
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AnalyticsIndexer } from '../analytics/analytics-indexer'
import { KnowIndexer } from './know-indexer'

const FX = join(__dirname, '../../../test/fixtures/transcripts/projects')
let dir = ''
let analytics: AnalyticsIndexer

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'hydra-know-it-'))
  cpSync(FX, join(dir, 'projects'), { recursive: true })
  analytics = new AnalyticsIndexer({
    projectsRoot: join(dir, 'projects'),
    cachePath: join(dir, 'analytics-index.json'),
    timeZone: 'UTC',
    tmpdir: null
  })
  await analytics.scan()
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const mk = (): KnowIndexer =>
  new KnowIndexer({ analytics, cardsPath: join(dir, 'know-cards.json'), getProjects: () => [] })

describe('KnowIndexer (integration)', () => {
  it('searches the fixtures lexically without cards (AC-5) and excludes temp sessions', async () => {
    const know = mk()
    const hits = know.search({ query: 'pregunta del usuario' })
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0]?.sessionId).toBe('bbbbbbbb-0000-4000-8000-000000000002')
    expect(hits[0]?.snippet).toMatch(/pregunta/i)
    expect(know.search({ query: 'tmp' }).map((h) => h.sessionId)).not.toContain(
      'cccccccc-0000-4000-8000-000000000003'
    )
    // pending: every fixture session with timestamps lacks a card
    expect(know.pending().length).toBeGreaterThanOrEqual(3)
  })

  it('cards persist, mark pending stale on growth, and supersede applies across sessions', async () => {
    const know = mk()
    const sid = 'bbbbbbbb-0000-4000-8000-000000000002'
    const lastTs = know.meta(sid)!.lastTs
    know.setCard(sid, {
      summary: 'Sesión de prueba',
      facts: [
        {
          id: `${sid}#1`,
          text: 'Se decidió usar watcher recursivo',
          kind: 'decision',
          entities: ['watcher'],
          ts: lastTs
        }
      ],
      generatedAt: 1,
      sourceLastTs: lastTs,
      model: 'haiku'
    })
    // reload from disk
    const know2 = mk()
    const hit = know2.search({ query: 'watcher' })[0]
    expect(hit?.sessionId).toBe(sid)
    expect(hit?.facts[0]?.text).toMatch(/watcher recursivo/)
    expect(know2.pending().find((p) => p.sessionId === sid)).toBeUndefined()

    // transcript grows → stale
    writeFileSync(
      join(dir, 'projects/-Users-dev-work-demo', `${sid}.jsonl`),
      JSON.stringify({
        type: 'user',
        cwd: '/Users/dev/work/demo',
        timestamp: '2026-08-15T10:00:00.000Z',
        message: { role: 'user', content: 'más' }
      }) + '\n',
      { flag: 'a' }
    )
    await analytics.scan()
    expect(know2.pending().find((p) => p.sessionId === sid)?.stale).toBe(true)

    // supersede from a newer card in another session
    know2.applySuperseded([`${sid}#1`], 'otra#1')
    const after = mk().search({ query: 'watcher' })[0]
    expect(after?.facts.find((f) => f.id === `${sid}#1`)).toBeUndefined()
    expect(after?.replaced.map((f) => f.id)).toContain(`${sid}#1`)
    expect(mk().vigenteFacts(know2.meta(sid)!.projectKey)).toEqual([])
  })
})
