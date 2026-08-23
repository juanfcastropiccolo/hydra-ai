import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseAgentsJson } from './agents-json'

const fx = (name: string): string =>
  readFileSync(join(__dirname, '../../../test/fixtures', name), 'utf8')

describe('parseAgentsJson', () => {
  it('parses the live capture (interactive sessions: idle/busy, no id/state)', () => {
    const r = parseAgentsJson(fx('agents-live-capture.json'))
    expect(r.error).toBeUndefined()
    expect(r.entries).toHaveLength(2)
    expect(r.entries.every((e) => e.kind === 'interactive' && e.id === undefined)).toBe(true)
    expect(r.entries.map((e) => e.status).sort()).toEqual(['busy', 'idle'])
  })
  it('parses a background session without prompt (idle + blocked) keeping id and sessionId', () => {
    const [e] = parseAgentsJson(fx('agents-bg-idle-noprompt.json')).entries
    expect(e).toMatchObject({
      kind: 'background',
      id: '7fd3402f',
      status: 'idle',
      state: 'blocked'
    })
    expect(e?.sessionId).toBe('7fd3402f-f032-4779-bafb-1a2d78eb47a6')
  })
  it.each([
    ['agents-bg-working.json', { status: 'working', state: 'working' }],
    ['agents-bg-waiting-permission.json', { status: 'waiting', waitingFor: 'permission prompt' }],
    ['agents-bg-waiting-input.json', { status: 'waiting', waitingFor: 'input needed' }],
    ['agents-bg-done.json', { state: 'done' }],
    ['agents-bg-stopped-nopid.json', { state: 'stopped' }]
  ])('parses %s', (file, expected) => {
    const [e] = parseAgentsJson(fx(file)).entries
    expect(e).toMatchObject(expected)
    if (file.includes('done') || file.includes('nopid')) expect(e?.pid).toBeUndefined()
  })
  it('parses the mixed fixture fully', () => {
    const r = parseAgentsJson(fx('agents-mixed.json'))
    expect(r.entries).toHaveLength(8)
    expect(r.skipped).toBe(0)
  })
  it('returns [] without error for an empty array', () => {
    expect(parseAgentsJson(fx('agents-empty.json'))).toEqual({ entries: [], skipped: 0 })
  })
  it('never throws: invalid output yields an error and no entries', () => {
    const r = parseAgentsJson(fx('agents-invalid.txt'))
    expect(r.entries).toEqual([])
    expect(r.error).toMatch(/no JSON array/)
    expect(parseAgentsJson('').error).toBeDefined()
    expect(parseAgentsJson('[{]').error).toMatch(/invalid JSON/)
  })
  it('tolerates banner lines before the array', () => {
    const r = parseAgentsJson(fx('agents-garbage-prefix.txt'))
    expect(r.error).toBeUndefined()
    expect(r.entries).toHaveLength(1)
  })
  it('skips malformed entries but keeps valid ones', () => {
    const r = parseAgentsJson(
      '[{"cwd":"/a","kind":"interactive","startedAt":1},{"nope":true},{"cwd":"","kind":"background","startedAt":2}]'
    )
    expect(r.entries).toHaveLength(1)
    expect(r.skipped).toBe(2)
  })
})
