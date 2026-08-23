import { describe, expect, it, vi } from 'vitest'
import type { ClaudeCliLike, RunPromptOptions } from '../claude/claude-cli'
import { AnalyticsIndexer } from '../analytics/analytics-indexer'
import { KnowIndexer } from './know-indexer'
import { CardQueue } from './card-queue'
import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const FX = join(__dirname, '../../../test/fixtures/transcripts/projects')

async function setup(): Promise<{ know: KnowIndexer; dir: string }> {
  const dir = mkdtempSync(join(tmpdir(), 'hydra-cq-'))
  cpSync(FX, join(dir, 'projects'), { recursive: true })
  const analytics = new AnalyticsIndexer({
    projectsRoot: join(dir, 'projects'),
    cachePath: join(dir, 'a.json'),
    timeZone: 'UTC',
    tmpdir: null
  })
  await analytics.scan()
  return {
    know: new KnowIndexer({ analytics, cardsPath: join(dir, 'cards.json'), getProjects: () => [] }),
    dir
  }
}

const cardJson = (summary: string, superseded: string[] = []): string =>
  JSON.stringify({
    summary,
    facts: [{ text: `${summary} hecho`, kind: 'dato', entities: ['tema'] }],
    superseded_ids: superseded
  })

function fakeCli(impl?: (o: RunPromptOptions) => Promise<string>): {
  cli: ClaudeCliLike
  calls: RunPromptOptions[]
} {
  const calls: RunPromptOptions[] = []
  const cli = {
    runPrompt: vi.fn(async (o: RunPromptOptions) => {
      calls.push(o)
      const text = impl ? await impl(o) : cardJson('Ficha ' + o.resumeSessionId)
      return { text, raw: { ok: true, text, costUsd: 0.02 } }
    })
  } as unknown as ClaudeCliLike
  return { cli, calls }
}

const NOW = 1_800_000_000_000

function mkQueue(
  know: KnowIndexer,
  cli: ClaudeCliLike,
  over: Partial<ConstructorParameters<typeof CardQueue>[0]> = {}
): CardQueue {
  return new CardQueue({
    know,
    cli: () => cli,
    model: () => 'haiku',
    autoCards: () => true,
    isSessionBusy: () => false,
    now: () => NOW,
    quietMs: 0,
    backoffMs: 1000,
    ...over
  })
}

describe('CardQueue', () => {
  it('initial backlog waits for approval; after approval it generates serially and records cost', async () => {
    const { know, dir } = await setup()
    const { cli, calls } = fakeCli()
    const q = mkQueue(know, cli)
    expect(q.backlogEstimate().count).toBeGreaterThanOrEqual(3)
    q.kick()
    await new Promise((r) => setTimeout(r, 50))
    expect(calls).toHaveLength(0) // backlog not approved yet
    q.approveBackfill()
    await vi.waitFor(() => expect(know.pending().length).toBe(0))
    expect(calls.length).toBeGreaterThanOrEqual(3)
    expect(new Set(calls.map((c) => c.resumeSessionId)).size).toBe(calls.length) // each once
    expect(q.totalCostUsd).toBeCloseTo(0.02 * calls.length, 5)
    expect(know.card('bbbbbbbb-0000-4000-8000-000000000002')?.summary).toMatch(/^Ficha/)
    rmSync(dir, { recursive: true, force: true })
  })

  it('busy or recent sessions are skipped; toggle off → nothing runs', async () => {
    const { know, dir } = await setup()
    const { cli, calls } = fakeCli()
    const busy = mkQueue(know, cli, { isSessionBusy: () => true })
    busy.approveBackfill()
    await new Promise((r) => setTimeout(r, 50))
    expect(calls).toHaveLength(0)
    const recent = mkQueue(know, cli, { quietMs: 10 ** 15 })
    recent.approveBackfill()
    await new Promise((r) => setTimeout(r, 50))
    expect(calls).toHaveLength(0)
    const off = mkQueue(know, cli, { autoCards: () => false })
    off.approveBackfill()
    await new Promise((r) => setTimeout(r, 50))
    expect(calls).toHaveLength(0)
    rmSync(dir, { recursive: true, force: true })
  })

  it('invalid JSON retries once with a stricter prompt, then backs off; recovery clears the error', async () => {
    const { know, dir } = await setup()
    let fail = true
    const { cli, calls } = fakeCli(async () => (fail ? 'no json' : cardJson('Bien')))
    const q = mkQueue(know, cli)
    const sid = know.pending()[0]!.sessionId
    expect(await q.generateOne(sid)).toBe(false)
    expect(calls).toHaveLength(2) // original + strict retry
    expect(q.lastError).toMatch(/JSON/)
    fail = false
    expect(await q.generateOne(sid)).toBe(true)
    expect(q.lastError).toBeNull()
    rmSync(dir, { recursive: true, force: true })
  })

  it('supersede ids from the new card are applied to older cards', async () => {
    const { know, dir } = await setup()
    const a = 'aaaaaaaa-0000-4000-8000-000000000001'
    const b = 'bbbbbbbb-0000-4000-8000-000000000002'
    know.setCard(a, {
      summary: 'vieja',
      facts: [{ id: `${a}#1`, text: 'hecho viejo', kind: 'dato', entities: ['tema'], ts: 1 }],
      generatedAt: 1,
      sourceLastTs: know.meta(a)!.lastTs,
      model: 'haiku'
    })
    const { cli } = fakeCli(async () => cardJson('Nueva', [`${a}#1`]))
    const q = mkQueue(know, cli)
    expect(await q.generateOne(b)).toBe(true)
    expect(know.card(a)!.facts[0]!.supersededBy).toBe(`${b}#1`)
    rmSync(dir, { recursive: true, force: true })
  })

  it('a session that grows after its card goes pending again (stale) and re-generates', async () => {
    const { know, dir } = await setup()
    const { cli, calls } = fakeCli()
    const q = mkQueue(know, cli)
    q.approveBackfill()
    await vi.waitFor(() => expect(know.pending().length).toBe(0))
    const before = calls.length
    // simulate growth: card older than transcript
    const sid = 'eeeeeeee-0000-4000-8000-000000000005'
    const card = know.card(sid)!
    know.setCard(sid, { ...card, sourceLastTs: card.sourceLastTs - 1000 })
    await vi.waitFor(() => expect(calls.length).toBeGreaterThan(before))
    rmSync(dir, { recursive: true, force: true })
  })
})
