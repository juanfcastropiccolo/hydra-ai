import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  emptyState,
  finalizeSession,
  knowledgeOf,
  localParts,
  reduceTranscriptLine,
  type TranscriptState
} from './transcript-reducer'

const FX = join(__dirname, '../../../test/fixtures/transcripts/projects')
const reduceFile = (rel: string, tz = 'UTC'): TranscriptState => {
  const st = emptyState()
  for (const line of readFileSync(join(FX, rel), 'utf8').split('\n'))
    reduceTranscriptLine(st, line, { timeZone: tz })
  return st
}

describe('reduceTranscriptLine + finalizeSession', () => {
  it('sanitized real session: dedupes usage by message.id, counts only human turns, tools, duration, ai-title', () => {
    const s = finalizeSession(
      reduceFile('-Users-dev-work-demo/aaaaaaaa-0000-4000-8000-000000000001.jsonl'),
      {
        sessionId: 'aaaaaaaa-0000-4000-8000-000000000001'
      }
    )
    expect(s).toMatchObject({
      sessionId: 'aaaaaaaa-0000-4000-8000-000000000001',
      cwd: '/Users/dev/work/demo',
      title: 'Demo session title',
      userTurns: 1,
      assistantMsgs: 3,
      durationMs: 27221,
      tools: { Bash: 2 },
      gitBranch: 'HEAD',
      skippedLines: 0,
      subagents: 0
    })
    expect(s.tokensByModel).toEqual({
      'claude-fable-5': { input: 6, output: 851, cacheWrite: 17246, cacheRead: 98055 }
    })
    // conversation span = user/assistant records only (attachments/away_summary don't count)
    expect(new Date(s.firstTs).toISOString()).toBe('2026-08-10T22:05:54.516Z')
    expect(new Date(s.lastTs).toISOString()).toBe('2026-08-10T22:06:21.731Z')
    expect(s.tokensByDay).toEqual({
      '2026-08-10': { input: 6, output: 851, cacheWrite: 17246, cacheRead: 98055 }
    })
    // 2026-08-10 is a Monday; all at 22h UTC
    expect(s.turnsByHourDow[1]?.[22]).toBe(1)
    expect(s.tokensByHourDow[1]?.[22]).toBe(6 + 851 + 17246 + 98055)
  })

  it('synthetic session: custom-title wins, meta/tool_result users are not turns, missing cache fields, broken lines skipped, two models/days', () => {
    const s = finalizeSession(
      reduceFile('-Users-dev-work-demo/bbbbbbbb-0000-4000-8000-000000000002.jsonl'),
      {
        sessionId: 'b'
      }
    )
    expect(s).toMatchObject({
      title: 'My custom title',
      userTurns: 2,
      assistantMsgs: 3,
      durationMs: 19000,
      tools: { Read: 1, Bash: 2 },
      gitBranch: 'feature/x',
      skippedLines: 1 // the broken line; the empty line is not counted
    })
    expect(s.tokensByModel).toEqual({
      'claude-opus-5': { input: 15, output: 150, cacheWrite: 1000, cacheRead: 5000 },
      'claude-haiku-4-5-20251001': { input: 7, output: 70, cacheWrite: 0, cacheRead: 700 }
    })
    expect(Object.keys(s.tokensByDay).sort()).toEqual(['2026-08-11', '2026-08-12'])
    expect(s.tokensByDay['2026-08-12']).toEqual({
      input: 7,
      output: 70,
      cacheWrite: 0,
      cacheRead: 700
    })
    // 2026-08-11 = Tuesday 13h, 2026-08-12 = Wednesday 22h (UTC)
    expect(s.turnsByHourDow[2]?.[13]).toBe(1)
    expect(s.turnsByHourDow[3]?.[22]).toBe(1)
  })

  it('buckets follow the injected time zone', () => {
    const s = finalizeSession(
      reduceFile(
        '-Users-dev-work-demo/bbbbbbbb-0000-4000-8000-000000000002.jsonl',
        'America/Argentina/Buenos_Aires'
      ),
      { sessionId: 'b' }
    )
    // 2026-08-12 22:40Z → 19:40 local, still Wednesday; 2026-08-11 13:15Z → 10:15 local Tuesday
    expect(s.turnsByHourDow[3]?.[19]).toBe(1)
    expect(s.turnsByHourDow[2]?.[10]).toBe(1)
    expect(Object.keys(s.tokensByDay).sort()).toEqual(['2026-08-11', '2026-08-12'])
  })

  it('subagents fold tokens/tools into the parent without adding human turns', () => {
    const parent = reduceFile('-Users-dev-work-demo/aaaaaaaa-0000-4000-8000-000000000001.jsonl')
    const sub = reduceFile(
      '-Users-dev-work-demo/aaaaaaaa-0000-4000-8000-000000000001/subagents/agent-x.jsonl'
    )
    const s = finalizeSession(parent, { sessionId: 'a', subagents: [sub] })
    expect(s.subagents).toBe(1)
    expect(s.userTurns).toBe(1)
    expect(s.assistantMsgs).toBe(4)
    expect(s.tools).toEqual({ Bash: 2, Read: 1 })
    expect(s.tokensByModel['claude-haiku-4-5-20251001']).toEqual({
      input: 3,
      output: 30,
      cacheWrite: 300,
      cacheRead: 3000
    })
  })

  it('user-only and empty transcripts produce sane summaries; first prompt becomes the title (trimmed)', () => {
    const s = finalizeSession(
      reduceFile('-Users-dev-work-demo/eeeeeeee-0000-4000-8000-000000000005.jsonl'),
      { sessionId: 'e' }
    )
    expect(s).toMatchObject({ title: 'hola?', userTurns: 1, assistantMsgs: 0, tokensByModel: {} })
    const empty = finalizeSession(
      reduceFile('-Users-dev-work-demo/dddddddd-0000-4000-8000-000000000004.jsonl'),
      { sessionId: 'd' }
    )
    expect(empty).toMatchObject({ title: 'd', cwd: '', firstTs: 0, lastTs: 0, userTurns: 0 })
    const cmd = emptyState()
    reduceTranscriptLine(
      cmd,
      JSON.stringify({
        type: 'user',
        timestamp: '2026-01-01T00:00:00Z',
        message: {
          role: 'user',
          content: '<command-name>/voice</command-name> <command-args>hola</command-args>'
        }
      })
    )
    expect(finalizeSession(cmd, { sessionId: 'c' }).title).toBe('/voice hola')
    const st = emptyState()
    reduceTranscriptLine(
      st,
      JSON.stringify({
        type: 'user',
        timestamp: '2026-01-01T00:00:00Z',
        message: { role: 'user', content: 'x'.repeat(200) }
      })
    )
    expect(finalizeSession(st, { sessionId: 's' }).title).toHaveLength(80)
  })

  it('state survives a JSON round-trip (cache) and keeps reducing', () => {
    const st = reduceFile('-Users-dev-work-demo/bbbbbbbb-0000-4000-8000-000000000002.jsonl')
    const back = JSON.parse(JSON.stringify(st)) as TranscriptState
    reduceTranscriptLine(
      back,
      JSON.stringify({
        type: 'assistant',
        timestamp: '2026-08-13T01:00:00Z',
        message: {
          id: 'msg_c',
          model: 'claude-opus-5',
          content: [],
          usage: { input_tokens: 99, output_tokens: 99 }
        }
      })
    )
    expect(finalizeSession(back, { sessionId: 'b' }).assistantMsgs).toBe(3) // msg_c already seen → ignored
    reduceTranscriptLine(
      back,
      JSON.stringify({
        type: 'assistant',
        timestamp: '2026-08-13T01:00:00Z',
        message: {
          id: 'msg_new',
          model: 'claude-opus-5',
          content: [],
          usage: { input_tokens: 1, output_tokens: 1 }
        }
      })
    )
    expect(finalizeSession(back, { sessionId: 'b' }).assistantMsgs).toBe(4)
  })

  it('localParts handles midnight and DST-free zones', () => {
    expect(localParts(Date.parse('2026-08-10T00:00:00Z'), 'UTC')).toEqual({
      day: '2026-08-10',
      dow: 1,
      hour: 0
    })
    expect(
      localParts(Date.parse('2026-08-10T02:30:00Z'), 'America/Argentina/Buenos_Aires')
    ).toEqual({ day: '2026-08-09', dow: 0, hour: 23 })
  })
})

describe('knowledge pass (006)', () => {
  it('collects touched files, commands and a weighted term bag; subagents merge; titles indexed', () => {
    const st = emptyState()
    const lines = [
      {
        type: 'user',
        timestamp: '2026-01-01T10:00:00Z',
        message: { role: 'user', content: 'Arreglar el watcher del file tree' }
      },
      {
        type: 'assistant',
        timestamp: '2026-01-01T10:00:05Z',
        message: {
          id: 'm1',
          model: 'claude-opus-5',
          content: [
            { type: 'text', text: 'Voy a editar el servicio' },
            { type: 'tool_use', name: 'Edit', input: { file_path: '/p/src/fs/fs-service.ts' } },
            { type: 'tool_use', name: 'Read', input: { file_path: '/p/src/fs/fs-service.ts' } },
            { type: 'tool_use', name: 'Bash', input: { command: 'npm test -- fs' } },
            { type: 'tool_use', name: 'Bash', input: { command: 'npm run lint' } },
            { type: 'tool_use', name: 'Bash', input: { command: 'git status' } }
          ],
          usage: { input_tokens: 1, output_tokens: 1 }
        }
      },
      { type: 'ai-title', aiTitle: 'Watcher del árbol', sessionId: 's' }
    ]
    for (const l of lines) reduceTranscriptLine(st, JSON.stringify(l), { timeZone: 'UTC' })
    const sub = emptyState()
    reduceTranscriptLine(
      sub,
      JSON.stringify({
        type: 'assistant',
        timestamp: '2026-01-01T10:01:00Z',
        message: {
          id: 'm2',
          model: 'claude-haiku-4-5',
          content: [{ type: 'tool_use', name: 'Write', input: { file_path: '/p/docs/nota.md' } }],
          usage: { input_tokens: 1, output_tokens: 1 }
        }
      }),
      { timeZone: 'UTC' }
    )
    const k = knowledgeOf(st, [sub])
    expect(k.files).toEqual({ '/p/src/fs/fs-service.ts': 2, '/p/docs/nota.md': 1 })
    expect(k.commands).toEqual(['npm', 'git'])
    expect(k.termBag['watcher']).toBeGreaterThanOrEqual(2 + 3) // user(x2) + title(x3)
    expect(k.termBag['arbol']).toBe(3)
    expect(k.termBag['editar']).toBe(1)
    expect(k.termBag['fs-service.ts']).toBeUndefined() // tool inputs are not text
  })

  it('knowledge fields survive the JSON round-trip (cache)', () => {
    const st = emptyState()
    reduceTranscriptLine(
      st,
      JSON.stringify({
        type: 'user',
        timestamp: '2026-01-01T00:00:00Z',
        message: { role: 'user', content: 'hola watcher' }
      })
    )
    const back = JSON.parse(JSON.stringify(st)) as TranscriptState
    expect(knowledgeOf(back).termBag['watcher']).toBe(2)
  })
})
