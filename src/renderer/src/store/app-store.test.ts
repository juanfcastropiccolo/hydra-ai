import { describe, expect, it } from 'vitest'
import type { Session } from '@shared/types'
import { createAppStore, selectAttentionCount, selectVisibleSessions } from './app-store'

const S = (id: string, over: Partial<Session> = {}): Session => ({
  sessionId: id,
  bgId: `bg-${id}`,
  kind: 'background',
  name: id,
  cwd: '/p',
  projectId: 'P',
  startedAt: 1,
  state: 'idle',
  lastStateAt: 1,
  source: 'poll',
  origin: 'hydra',
  ...over
})

describe('app-store', () => {
  it('focus is exclusive and blur only clears if it owns the focus', () => {
    const st = createAppStore()
    st.getState().focus('a')
    st.getState().focus('b')
    expect(st.getState().focusedSessionId).toBe('b')
    st.getState().blur('a')
    expect(st.getState().focusedSessionId).toBe('b')
    st.getState().blur('b')
    expect(st.getState().focusedSessionId).toBeNull()
  })
  it('toggleExpand toggles one pane; collapse clears', () => {
    const st = createAppStore()
    st.getState().toggleExpand('a')
    expect(st.getState().expandedSessionId).toBe('a')
    st.getState().toggleExpand('b')
    expect(st.getState().expandedSessionId).toBe('b')
    st.getState().toggleExpand('b')
    expect(st.getState().expandedSessionId).toBeNull()
    st.getState().toggleExpand('a')
    st.getState().collapse()
    expect(st.getState().expandedSessionId).toBeNull()
  })
  it('split (008): setSplit needs an expanded pane and never the same session on both sides', () => {
    const st = createAppStore()
    st.getState().setSplit('b')
    expect(st.getState().splitSessionId).toBeNull() // nothing expanded → ignored
    st.getState().toggleExpand('a')
    st.getState().setSplit('a')
    expect(st.getState().splitSessionId).toBeNull() // same as A → ignored
    st.getState().setSplit('b')
    expect(st.getState().splitSessionId).toBe('b')
    st.getState().setSplit(null)
    expect(st.getState().splitSessionId).toBeNull()
    expect(st.getState().expandedSessionId).toBe('a')
  })
  it('split (008): toggleExpand/collapse/escape from a split go back to the grid', () => {
    const st = createAppStore()
    st.getState().toggleExpand('a')
    st.getState().setSplit('b')
    st.getState().toggleExpand('b') // dblclick on B
    expect(st.getState()).toMatchObject({ expandedSessionId: null, splitSessionId: null })
    st.getState().toggleExpand('a')
    st.getState().setSplit('b')
    st.getState().toggleExpand('a') // dblclick on A
    expect(st.getState()).toMatchObject({ expandedSessionId: null, splitSessionId: null })
    st.getState().toggleExpand('a')
    st.getState().setSplit('b')
    st.getState().collapse()
    expect(st.getState()).toMatchObject({ expandedSessionId: null, splitSessionId: null })
    st.getState().toggleExpand('a')
    st.getState().setSplit('b')
    expect(st.getState().escape()).toBe(true)
    expect(st.getState()).toMatchObject({ expandedSessionId: null, splitSessionId: null })
  })
  it('split (008): hiding/losing B clears the split; hiding/losing A promotes B', () => {
    const st = createAppStore()
    st.getState().setSessions([S('a'), S('b')])
    st.getState().toggleExpand('a')
    st.getState().setSplit('b')
    st.getState().hide('b')
    expect(st.getState()).toMatchObject({ expandedSessionId: 'a', splitSessionId: null })
    st.getState().show('b')
    st.getState().setSplit('b')
    st.getState().hide('a')
    expect(st.getState()).toMatchObject({ expandedSessionId: 'b', splitSessionId: null })
    st.getState().show('a')
    st.getState().setSplit('a')
    st.getState().setSessions([S('b')]) // A vanished → B promoted
    expect(st.getState()).toMatchObject({ expandedSessionId: 'b', splitSessionId: null })
    st.getState().setSessions([S('a'), S('b')])
    st.getState().setSplit('a')
    st.getState().setSessions([S('b')]) // wait: A is 'b', B is 'a' → B vanished → split cleared
    expect(st.getState()).toMatchObject({ expandedSessionId: 'b', splitSessionId: null })
  })
  it('escape collapses only when no terminal is focused (FR-16) and closes the dialog first', () => {
    const st = createAppStore()
    st.getState().toggleExpand('a')
    st.getState().focus('a')
    expect(st.getState().escape()).toBe(false)
    expect(st.getState().expandedSessionId).toBe('a')
    st.getState().blur('a')
    expect(st.getState().escape()).toBe(true)
    expect(st.getState().expandedSessionId).toBeNull()
    st.getState().openNewSessionDialog({ projectId: 'P', suggestedName: 'p-1' })
    st.getState().toggleExpand('a')
    expect(st.getState().escape()).toBe(true)
    expect(st.getState().newSessionDialog).toBeNull()
    expect(st.getState().expandedSessionId).toBe('a') // dialog consumed the Esc
  })
  it('hide/show: hidden panes drop focus/expand; visible selector honours it and attachability', () => {
    const st = createAppStore()
    st.getState().setSessions([S('a'), S('b'), S('ext', { bgId: undefined, kind: 'interactive' })])
    st.getState().focus('a')
    st.getState().toggleExpand('a')
    st.getState().hide('a')
    expect(st.getState()).toMatchObject({
      focusedSessionId: null,
      expandedSessionId: null,
      hiddenSessionIds: ['a']
    })
    expect(selectVisibleSessions(st.getState()).map((s) => s.sessionId)).toEqual(['b'])
    st.getState().show('a')
    expect(selectVisibleSessions(st.getState()).map((s) => s.sessionId)).toEqual(['a', 'b'])
    st.getState().hide('a')
    st.getState().hide('a')
    expect(st.getState().hiddenSessionIds).toEqual(['a'])
  })
  it('setSessions drops focus/expand for sessions that no longer exist', () => {
    const st = createAppStore()
    st.getState().setSessions([S('a')])
    st.getState().focus('a')
    st.getState().toggleExpand('a')
    st.getState().setSessions([S('a', { state: 'ended' })])
    expect(st.getState().focusedSessionId).toBe('a') // ended but still listed keeps it
    st.getState().setSessions([])
    expect(st.getState()).toMatchObject({ focusedSessionId: null, expandedSessionId: null })
  })
  it('attention count = waiting sessions per project', () => {
    const st = createAppStore()
    st.getState().setSessions([
      S('a', { state: 'waiting' }),
      S('b', { state: 'waiting', projectId: 'Q' }),
      S('c')
    ])
    expect(selectAttentionCount(st.getState(), 'P')).toBe(1)
    expect(selectAttentionCount(st.getState(), 'Q')).toBe(1)
    expect(selectAttentionCount(st.getState(), 'Z')).toBe(0)
  })
  it('ptyIds map set/clear', () => {
    const st = createAppStore()
    st.getState().setPtyId('a', 'pty-1')
    expect(st.getState().ptyIds).toEqual({ a: 'pty-1' })
    st.getState().setPtyId('a', null)
    expect(st.getState().ptyIds).toEqual({})
  })
})
