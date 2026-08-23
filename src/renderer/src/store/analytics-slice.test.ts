import { describe, expect, it } from 'vitest'
import { createAnalyticsStore } from './analytics-slice'
import { createAppStore } from './app-store'

describe('analytics store', () => {
  it('loads sessions/prefs and keeps filters', () => {
    const st = createAnalyticsStore()
    expect(st.getState().loaded).toBe(false)
    st.getState().setSessions([], true)
    expect(st.getState()).toMatchObject({ loaded: true, fromCache: true })
    st.getState().setPrefs({
      range: '30d',
      pricing: { x: { input: 1, output: 1, cacheWrite: 1, cacheRead: 1 } }
    })
    expect(st.getState().range).toBe('30d')
    st.getState().toggleProjectKey('P1')
    expect(st.getState().projectKey).toBe('P1')
    st.getState().toggleProjectKey('P1')
    expect(st.getState().projectKey).toBeNull()
    st.getState().setProgress({ phase: 'scan', done: 1, total: 2 })
    st.getState().reset()
    expect(st.getState()).toMatchObject({ sessions: [], loaded: false, progress: null })
  })
  it('sortBy flips direction on the same column, defaults by column type', () => {
    const st = createAnalyticsStore()
    expect(st.getState().sort).toEqual({ key: 'firstTs', dir: 'desc' })
    st.getState().sortBy('cost')
    expect(st.getState().sort).toEqual({ key: 'cost', dir: 'desc' })
    st.getState().sortBy('cost')
    expect(st.getState().sort.dir).toBe('asc')
    st.getState().sortBy('title')
    expect(st.getState().sort).toEqual({ key: 'title', dir: 'asc' })
  })
})

describe('app store centerView', () => {
  it('switching to analytics blurs the focused pane; back to sessions keeps nothing focused by itself', () => {
    const st = createAppStore()
    st.getState().focus('A')
    st.getState().setCenterView('analytics')
    expect(st.getState()).toMatchObject({
      centerView: 'analytics',
      focusedSessionId: null,
      lastFocusedSessionId: 'A'
    })
    st.getState().setCenterView('sessions')
    expect(st.getState()).toMatchObject({ centerView: 'sessions', focusedSessionId: null })
  })
})
