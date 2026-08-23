// Renderer state. Vanilla zustand store (testable without React) + a React hook wrapper.
// Invariants enforced here (see Constitution principle 3 / FR-15..17):
//  - at most one focused pane; focus only changes through explicit focus()/blur() calls that the
//    XTerm component fires from the terminal's own focus/blur events (never the other way round)
//  - at most one expanded pane; Esc collapses only when no terminal has focus
import { createStore, useStore, type StoreApi } from 'zustand'
import type { ClaudeAvailability, Project, Session } from '@shared/types'

export interface NewSessionDialogState {
  projectId: string
  suggestedName: string
}

export interface AppState {
  availability: ClaudeAvailability | null
  projects: Project[]
  sessions: Session[]
  hiddenSessionIds: string[]
  /** sessionId → ptyId for panes that currently have an attached terminal */
  ptyIds: Record<string, string>
  focusedSessionId: string | null
  expandedSessionId: string | null
  newSessionDialog: NewSessionDialogState | null
  lastError: string | null

  setAvailability(a: ClaudeAvailability): void
  setProjects(p: Project[]): void
  setSessions(s: Session[]): void
  setHidden(ids: string[]): void
  setPtyId(sessionId: string, ptyId: string | null): void
  focus(sessionId: string): void
  blur(sessionId: string): void
  toggleExpand(sessionId: string): void
  collapse(): void
  /** Global Esc: collapse only if no terminal holds the focus (FR-16). Returns true if it acted. */
  escape(): boolean
  hide(sessionId: string): void
  show(sessionId: string): void
  openNewSessionDialog(d: NewSessionDialogState): void
  closeNewSessionDialog(): void
  setError(msg: string | null): void
}

export type AppStore = StoreApi<AppState>

export function createAppStore(): AppStore {
  return createStore<AppState>((set, get) => ({
    availability: null,
    projects: [],
    sessions: [],
    hiddenSessionIds: [],
    ptyIds: {},
    focusedSessionId: null,
    expandedSessionId: null,
    newSessionDialog: null,
    lastError: null,

    setAvailability: (availability) => set({ availability }),
    setProjects: (projects) => set({ projects }),
    setSessions: (sessions) => {
      const ids = new Set(sessions.map((s) => s.sessionId))
      const { focusedSessionId, expandedSessionId } = get()
      set({
        sessions,
        // A session that vanished entirely can no longer be focused/expanded.
        focusedSessionId: focusedSessionId && ids.has(focusedSessionId) ? focusedSessionId : null,
        expandedSessionId:
          expandedSessionId && ids.has(expandedSessionId) ? expandedSessionId : null
      })
    },
    setHidden: (hiddenSessionIds) => set({ hiddenSessionIds }),
    setPtyId: (sessionId, ptyId) =>
      set((s) => {
        const ptyIds = { ...s.ptyIds }
        if (ptyId) ptyIds[sessionId] = ptyId
        else delete ptyIds[sessionId]
        return { ptyIds }
      }),
    focus: (sessionId) => set({ focusedSessionId: sessionId }),
    blur: (sessionId) =>
      set((s) => (s.focusedSessionId === sessionId ? { focusedSessionId: null } : {})),
    toggleExpand: (sessionId) =>
      set((s) => ({ expandedSessionId: s.expandedSessionId === sessionId ? null : sessionId })),
    collapse: () => set({ expandedSessionId: null }),
    escape: () => {
      const { focusedSessionId, expandedSessionId, newSessionDialog } = get()
      if (newSessionDialog) {
        set({ newSessionDialog: null })
        return true
      }
      if (expandedSessionId && focusedSessionId === null) {
        set({ expandedSessionId: null })
        return true
      }
      return false
    },
    hide: (sessionId) =>
      set((s) => ({
        hiddenSessionIds: s.hiddenSessionIds.includes(sessionId)
          ? s.hiddenSessionIds
          : [...s.hiddenSessionIds, sessionId],
        focusedSessionId: s.focusedSessionId === sessionId ? null : s.focusedSessionId,
        expandedSessionId: s.expandedSessionId === sessionId ? null : s.expandedSessionId
      })),
    show: (sessionId) =>
      set((s) => ({ hiddenSessionIds: s.hiddenSessionIds.filter((id) => id !== sessionId) })),
    openNewSessionDialog: (newSessionDialog) => set({ newSessionDialog }),
    closeNewSessionDialog: () => set({ newSessionDialog: null }),
    setError: (lastError) => set({ lastError })
  }))
}

// ---- selectors (pure) ----
export const selectVisibleSessions = (s: AppState): Session[] =>
  s.sessions.filter((x) => x.bgId && !s.hiddenSessionIds.includes(x.sessionId))

export const selectSessionsByProject = (s: AppState): Map<string | null, Session[]> => {
  const m = new Map<string | null, Session[]>()
  for (const x of s.sessions) {
    const arr = m.get(x.projectId) ?? []
    arr.push(x)
    m.set(x.projectId, arr)
  }
  return m
}

export const selectAttentionCount = (s: AppState, projectId: string): number =>
  s.sessions.filter((x) => x.projectId === projectId && x.state === 'waiting').length

// ---- React binding ----
export const appStore = createAppStore()
export function useAppStore<T>(selector: (s: AppState) => T): T {
  return useStore(appStore, selector)
}
