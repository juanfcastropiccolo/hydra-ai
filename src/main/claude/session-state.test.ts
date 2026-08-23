import { describe, expect, it } from 'vitest'
import { mapSessionState } from './session-state'

describe('mapSessionState — decision table', () => {
  it.each([
    // [description, entry, expected state]
    ['bg working', { kind: 'background', status: 'working', state: 'working', pid: 1 }, 'working'],
    [
      'bg waiting permission',
      {
        kind: 'background',
        status: 'waiting',
        state: 'blocked',
        pid: 1,
        waitingFor: 'permission prompt'
      },
      'waiting'
    ],
    [
      'bg waiting input',
      {
        kind: 'background',
        status: 'waiting',
        state: 'blocked',
        pid: 1,
        waitingFor: 'input needed'
      },
      'waiting'
    ],
    [
      'bg idle without prompt (state blocked!)',
      { kind: 'background', status: 'idle', state: 'blocked', pid: 1 },
      'idle'
    ],
    ['bg done (no pid)', { kind: 'background', state: 'done' }, 'ended'],
    ['bg stopped (no pid)', { kind: 'background', state: 'stopped' }, 'ended'],
    ['bg failed', { kind: 'background', state: 'failed', pid: 1 }, 'ended'],
    ['interactive busy', { kind: 'interactive', status: 'busy', pid: 1 }, 'working'],
    ['interactive idle', { kind: 'interactive', status: 'idle', pid: 1 }, 'idle'],
    ['process gone, no state', { kind: 'interactive', status: 'idle' }, 'ended'],
    ['case-insensitive', { kind: 'background', status: 'WORKING', pid: 1 }, 'working']
  ] as const)('%s → %s', (_d, entry, expected) => {
    expect(mapSessionState(entry).state).toBe(expected)
  })

  it('carries waitingFor and defaults it to "unknown" when missing', () => {
    expect(
      mapSessionState({ kind: 'background', status: 'waiting', pid: 1, waitingFor: 'dialog open' })
        .waitingFor
    ).toBe('dialog open')
    expect(mapSessionState({ kind: 'background', status: 'waiting', pid: 1 }).waitingFor).toBe(
      'unknown'
    )
  })
  it('waiting wins over a working state (transition in flight)', () => {
    expect(
      mapSessionState({ kind: 'background', status: 'waiting', state: 'working', pid: 1 }).state
    ).toBe('waiting')
  })
  it('unknown vocabulary → idle, flagged', () => {
    const r = mapSessionState({ kind: 'background', status: 'meditating', pid: 1 })
    expect(r).toEqual({ state: 'idle', unknown: true })
  })
})
