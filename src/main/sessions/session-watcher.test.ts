import { describe, expect, it, vi } from 'vitest'
import type { Project } from '@shared/types'
import type { AgentEntry } from '../claude/agents-json'
import { SessionWatcher } from './session-watcher'

const projects: Project[] = [{ id: 'foo', name: 'foo', path: '/p/foo', addedAt: 'x' }]
const bg = (over: Partial<AgentEntry> = {}): AgentEntry => ({
  cwd: '/p/foo',
  kind: 'background',
  startedAt: 1,
  pid: 10,
  id: 'bg1',
  sessionId: 'S1',
  name: 'foo-1',
  status: 'idle',
  state: 'blocked',
  ...over
})

function make(
  entriesRef: { current: AgentEntry[] },
  t = { now: 1000 }
): { w: SessionWatcher; listSessions: ReturnType<typeof vi.fn>; changes: number[] } {
  const listSessions = vi.fn(async (): Promise<{ entries: AgentEntry[]; error?: string }> => ({
    entries: entriesRef.current
  }))
  const w = new SessionWatcher({
    listSessions,
    getProjects: () => projects,
    realpath: (p) => p,
    now: () => t.now,
    pollMs: 2000
  })
  const changes: number[] = []
  w.on('changed', (s) => changes.push(s.length))
  return { w, listSessions, changes }
}

describe('SessionWatcher', () => {
  it('poll discovers sessions, assigns project, maps state, tags external by default', async () => {
    const ref = { current: [bg()] }
    const { w } = make(ref)
    await w.poll()
    const [s] = w.list()
    expect(s).toMatchObject({
      sessionId: 'S1',
      bgId: 'bg1',
      projectId: 'foo',
      state: 'idle',
      origin: 'external',
      source: 'poll'
    })
  })
  it('ignores (projectId null) sessions outside registered projects but still lists them', async () => {
    const ref = { current: [bg({ cwd: '/elsewhere', sessionId: 'S9' })] }
    const { w } = make(ref)
    await w.poll()
    expect(w.get('S9')?.projectId).toBeNull()
  })
  it('markOwned(bgId) before the first poll → origin hydra', async () => {
    const ref = { current: [bg()] }
    const { w } = make(ref)
    w.markOwned('bg1')
    await w.poll()
    expect(w.get('S1')?.origin).toBe('hydra')
  })
  it('a hook event updates state instantly and wins over an older poll', async () => {
    const ref = { current: [bg()] }
    const t = { now: 1000 }
    const { w } = make(ref, t)
    await w.poll()
    w.applyHook({ sessionId: 'S1', event: 'UserPromptSubmit', receivedAt: 1500 })
    expect(w.get('S1')).toMatchObject({ state: 'working', source: 'hook', origin: 'hydra' })
    // A poll at t=1200 (older than the hook) must not revert to idle
    t.now = 1200
    await w.poll()
    expect(w.get('S1')?.state).toBe('working')
    // A newer poll reporting waiting does apply
    t.now = 2000
    ref.current = [bg({ status: 'waiting', waitingFor: 'permission prompt' })]
    await w.poll()
    expect(w.get('S1')).toMatchObject({
      state: 'waiting',
      waitingFor: 'permission prompt',
      source: 'poll'
    })
  })
  it('Notification permission_prompt → waiting; Stop → idle and clears waitingFor', async () => {
    const ref = { current: [bg()] }
    const { w } = make(ref)
    await w.poll()
    w.applyHook({
      sessionId: 'S1',
      event: 'Notification',
      notificationType: 'permission_prompt',
      receivedAt: 1100
    })
    expect(w.get('S1')?.state).toBe('waiting')
    w.applyHook({ sessionId: 'S1', event: 'Stop', receivedAt: 1200 })
    expect(w.get('S1')).toMatchObject({ state: 'idle' })
    expect(w.get('S1')?.waitingFor).toBeUndefined()
  })
  it('a session missing from the next poll becomes ended', async () => {
    const ref = { current: [bg()] }
    const t = { now: 1000 }
    const { w } = make(ref, t)
    await w.poll()
    ref.current = []
    t.now = 3000
    await w.poll()
    expect(w.get('S1')?.state).toBe('ended')
  })
  it('an interactive session that gets backgrounded gains a bgId and kind on the next poll', async () => {
    const ref = { current: [bg({ kind: 'interactive', id: undefined, status: 'busy' })] }
    const { w } = make(ref)
    await w.poll()
    expect(w.get('S1')).toMatchObject({ kind: 'interactive', state: 'working' })
    expect(w.get('S1')?.bgId).toBeUndefined()
    ref.current = [bg({ kind: 'background', id: 'bgX', status: 'working' })]
    await w.poll()
    expect(w.get('S1')).toMatchObject({ kind: 'background', bgId: 'bgX' })
  })
  it('emits changed only when something changed; pollError on CLI failure', async () => {
    const ref = { current: [bg()] }
    const { w, changes, listSessions } = make(ref)
    await w.poll()
    await w.poll()
    expect(changes).toEqual([1])
    const errors: string[] = []
    w.on('pollError', (e) => errors.push(e))
    listSessions.mockResolvedValueOnce({ entries: [], error: 'daemon down' })
    await w.poll()
    expect(errors).toEqual(['daemon down'])
    expect(w.get('S1')?.state).toBe('idle') // not marked ended on a failed poll
  })
  it('start() polls immediately and on the interval; stop() clears it', async () => {
    vi.useFakeTimers()
    const ref = { current: [bg()] }
    const listSessions = vi.fn(async () => ({ entries: ref.current }))
    const w = new SessionWatcher({
      listSessions,
      getProjects: () => projects,
      realpath: (p) => p,
      pollMs: 2000
    })
    w.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(listSessions).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(4100)
    expect(listSessions).toHaveBeenCalledTimes(3)
    w.stop()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(listSessions).toHaveBeenCalledTimes(3)
    vi.useRealTimers()
  })
  it('refreshProjectIndex reassigns projects when the list changes', async () => {
    const ref = { current: [bg({ cwd: '/p/bar', sessionId: 'S2' })] }
    const projs: Project[] = []
    const w = new SessionWatcher({
      listSessions: async () => ({ entries: ref.current }),
      getProjects: () => projs,
      realpath: (p) => p
    })
    await w.poll()
    expect(w.get('S2')?.projectId).toBeNull()
    projs.push({ id: 'bar', name: 'bar', path: '/p/bar', addedAt: 'x' })
    w.refreshProjectIndex()
    expect(w.get('S2')?.projectId).toBe('bar')
  })
})
