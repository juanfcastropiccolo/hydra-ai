// Integration (feature 005): AnalyticsIndexer over a real temp copy of the transcript fixtures.
import {
  appendFileSync,
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  truncateSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SessionSummary } from '@shared/analytics/types'
import { AnalyticsIndexer } from './analytics-indexer'
import { INDEX_CACHE_VERSION } from './index-cache'

const FX = join(__dirname, '../../../test/fixtures/transcripts/projects')
let dir = ''
let root = ''
let cachePath = ''
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hydra-analytics-it-'))
  root = join(dir, 'projects')
  cpSync(FX, root, { recursive: true })
  cachePath = join(dir, 'analytics-index.json')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const mk = (
  over: Partial<ConstructorParameters<typeof AnalyticsIndexer>[0]> = {}
): AnalyticsIndexer =>
  new AnalyticsIndexer({
    projectsRoot: root,
    cachePath,
    timeZone: 'UTC',
    tmpdir: null,
    watchDebounceMs: 300,
    emitEveryMs: 0,
    ...over
  })

const byId = (list: SessionSummary[]): Record<string, SessionSummary> =>
  Object.fromEntries(list.map((s) => [s.sessionId, s]))

describe('AnalyticsIndexer (integration)', () => {
  it('first scan indexes every session (temp excluded, subagent folded, empty/broken tolerated) and reports progress', async () => {
    const ix = mk()
    const progress: Array<{ done: number; total: number }> = []
    ix.on('progress', (p) => progress.push({ done: p.done, total: p.total }))
    const first = await ix.open()
    expect(first.fromCache).toBe(false)
    expect(first.sessions).toEqual([])
    await ix.scan()
    ix.close()
    const s = byId(ix.sessions())
    expect(Object.keys(s).sort()).toEqual([
      'aaaaaaaa-0000-4000-8000-000000000001',
      'bbbbbbbb-0000-4000-8000-000000000002',
      'dddddddd-0000-4000-8000-000000000004',
      'eeeeeeee-0000-4000-8000-000000000005'
    ]) // cccc (temp) excluded
    expect(s['aaaaaaaa-0000-4000-8000-000000000001']).toMatchObject({
      subagents: 1,
      assistantMsgs: 4,
      title: 'Demo session title'
    })
    expect(s['bbbbbbbb-0000-4000-8000-000000000002']).toMatchObject({
      userTurns: 2,
      skippedLines: 1
    })
    expect(progress.at(-1)).toEqual({ done: 6, total: 6 }) // 5 sessions + 1 subagent file
    expect(ix.lastScanFiles).toBe(6)
    const cache = JSON.parse(readFileSync(cachePath, 'utf8')) as {
      version: number
      files: Record<string, unknown>
    }
    expect(cache.version).toBe(INDEX_CACHE_VERSION)
    expect(Object.keys(cache.files)).toHaveLength(6)
  })

  it('second run answers from cache and a scan without changes reads 0 bytes', async () => {
    const a = mk()
    await a.scan()
    const b = mk()
    const r = await b.open()
    b.close()
    expect(r.fromCache).toBe(true)
    expect(r.sessions).toHaveLength(4)
    await b.scan()
    expect(b.lastScanBytes).toBe(0)
    expect(b.lastScanFiles).toBe(0)
  })

  it('appending to a transcript only reads the new bytes and updates the summary; a partial last line waits', async () => {
    const ix = mk()
    await ix.scan()
    const file = join(root, '-Users-dev-work-demo/eeeeeeee-0000-4000-8000-000000000005.jsonl')
    const before = statSync(file).size
    const line =
      JSON.stringify({
        type: 'assistant',
        timestamp: '2026-08-13T08:00:05.000Z',
        message: {
          id: 'msg_e1',
          model: 'claude-opus-5',
          content: [{ type: 'text', text: 'hi' }],
          usage: { input_tokens: 11, output_tokens: 22 }
        }
      }) + '\n'
    await sleep(20) // distinct mtime
    appendFileSync(file, line + '{"type":"user","partial')
    await ix.scan()
    expect(ix.lastScanFiles).toBe(1)
    expect(ix.lastScanBytes).toBe(Buffer.byteLength(line))
    const s = byId(ix.sessions())['eeeeeeee-0000-4000-8000-000000000005']!
    expect(s.assistantMsgs).toBe(1)
    expect(s.tokensByModel['claude-opus-5']).toEqual({
      input: 11,
      output: 22,
      cacheWrite: 0,
      cacheRead: 0
    })
    // complete the partial line → only that tail is read
    await sleep(20)
    appendFileSync(file, '"}\n')
    await ix.scan()
    expect(ix.lastScanBytes).toBe(Buffer.byteLength('{"type":"user","partial"}\n'))
    expect(statSync(file).size).toBe(
      before + Buffer.byteLength(line) + Buffer.byteLength('{"type":"user","partial"}\n')
    )
  })

  it('a truncated/rewritten transcript is re-read from scratch; corrupt or stale cache rebuilds', async () => {
    const ix = mk()
    await ix.scan()
    const file = join(root, '-Users-dev-work-demo/bbbbbbbb-0000-4000-8000-000000000002.jsonl')
    const content = readFileSync(file, 'utf8').split('\n').slice(0, 5).join('\n') + '\n'
    await sleep(20)
    truncateSync(file, 0)
    writeFileSync(file, content)
    await ix.scan()
    expect(ix.lastScanBytes).toBe(Buffer.byteLength(content))
    expect(byId(ix.sessions())['bbbbbbbb-0000-4000-8000-000000000002']!.userTurns).toBe(1)

    writeFileSync(cachePath, '{not json')
    const c = mk()
    expect(c.cacheLoadReason).toBe('invalid')
    await c.scan()
    expect(c.lastScanFiles).toBe(6)
    writeFileSync(cachePath, JSON.stringify({ version: 999, timeZone: 'UTC', files: {} }))
    expect(mk().cacheLoadReason).toBe('stale')
    const tz = mk({ timeZone: 'America/Argentina/Buenos_Aires' })
    expect(tz.cacheLoadReason).toBe('stale')
  })

  it('watches the root and re-scans after a write (debounced)', async () => {
    const ix = mk()
    await ix.open()
    await sleep(300) // initial scan + watcher start
    const updates: number[] = []
    ix.on('sessions', (s) => updates.push(s.length))
    const file = join(root, '-Users-dev-work-demo/ffffffff-0000-4000-8000-000000000006.jsonl')
    writeFileSync(
      file,
      JSON.stringify({
        type: 'user',
        cwd: '/Users/dev/work/demo',
        timestamp: '2026-08-14T09:00:00.000Z',
        message: { role: 'user', content: 'nueva' }
      }) + '\n'
    )
    const t0 = Date.now()
    while (!updates.some((n) => n === 5) && Date.now() - t0 < 8000) await sleep(100)
    ix.close()
    expect(updates).toContain(5)
    expect(Date.now() - t0).toBeLessThan(8000)
  }, 15_000)

  it('missing root → no sessions, no error', async () => {
    const ix = mk({ projectsRoot: join(dir, 'nope') })
    const errors: string[] = []
    ix.on('error', (e) => errors.push(e))
    const r = await ix.open()
    await ix.scan()
    ix.close()
    expect(r.sessions).toEqual([])
    expect(errors).toEqual([])
  })
})
