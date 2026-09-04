// Renderer state. Vanilla zustand store (testable without React) + a React hook wrapper.
// Invariants enforced here (see Constitution principle 3 / FR-15..17):
//  - at most one focused pane; focus only changes through explicit focus()/blur() calls that the
//    XTerm component fires from the terminal's own focus/blur events (never the other way round)
//  - at most one expanded pane; Esc collapses only when no terminal has focus
//  - feature 008: a split (second pane, side B) only exists while a pane is expanded (side A),
//    never with the same session on both sides; losing A promotes B, losing B ends the split
import { createStore, useStore, type StoreApi } from 'zustand'
import type { ClaudeAvailability, Project, Session } from '@shared/types'
import type { CenterView } from '@shared/analytics/types'

export interface NewSessionDialogState {
  projectId: string
  suggestedName: string
  /** Feature 002 'Abrir terminal acá': subfolder to run the session in. */
  cwd?: string
}

export interface AppState {
  availability: ClaudeAvailability | null
  projects: Project[]
  sessions: Session[]
  hiddenSessionIds: string[]
  /** sessionId → ptyId for panes that currently have an attached terminal */
  ptyIds: Record<string, string>
  focusedSessionId: string | null
  /** Last pane that had focus (survives blur) — used by the file tree to hand focus back (Esc) and to follow projects. */
  lastFocusedSessionId: string | null
  expandedSessionId: string | null
  /** Feature 008: the pane shown to the right of the expanded one (split view), or null. */
  splitSessionId: string | null
  newSessionDialog: NewSessionDialogState | null
  lastError: string | null
  /** Feature 005: which view fills the central area. Switching away from sessions blurs every terminal. */
  centerView: CenterView

  setAvailability(a: ClaudeAvailability): void
  setProjects(p: Project[]): void
  setSessions(s: Session[]): void
  setHidden(ids: string[]): void
  setPtyId(sessionId: string, ptyId: string | null): void
  focus(sessionId: string): void
  blur(sessionId: string): void
  toggleExpand(sessionId: string): void
  collapse(): void
  /** Feature 008: show `sessionId` next to the expanded pane (null ends the split). */
  setSplit(sessionId: string | null): void
  /** Global Esc: collapse only if no terminal holds the focus (FR-16). Returns true if it acted. */
  escape(): boolean
  hide(sessionId: string): void
  show(sessionId: string): void
  openNewSessionDialog(d: NewSessionDialogState): void
  closeNewSessionDialog(): void
  setError(msg: string | null): void
  setCenterView(view: CenterView): void
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
    lastFocusedSessionId: null,
    expandedSessionId: null,
    splitSessionId: null,
    newSessionDialog: null,
    lastError: null,
    centerView: 'sessions',

    setAvailability: (availability) => set({ availability }),
    setProjects: (projects) => set({ projects }),
    setSessions: (sessions) => {
      const ids = new Set(sessions.map((s) => s.sessionId))
      const { focusedSessionId, expandedSessionId, splitSessionId } = get()
      set({
        sessions,
        // A session that vanished entirely can no longer be focused/expanded.
        focusedSessionId: focusedSessionId && ids.has(focusedSessionId) ? focusedSessionId : null,
        ...withoutPane(expandedSessionId, splitSessionId, (id) => !ids.has(id))
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
    focus: (sessionId) => set({ focusedSessionId: sessionId, lastFocusedSessionId: sessionId }),
    blur: (sessionId) =>
      set((s) => (s.focusedSessionId === sessionId ? { focusedSessionId: null } : {})),
    toggleExpand: (sessionId) =>
      set((s) =>
        // From a split (dblclick / ⤡ on either side) the way out is always the grid.
        s.splitSessionId !== null || s.expandedSessionId === sessionId
          ? { expandedSessionId: null, splitSessionId: null }
          : { expandedSessionId: sessionId }
      ),
    collapse: () => set({ expandedSessionId: null, splitSessionId: null }),
    setSplit: (sessionId) =>
      set((s) => {
        if (sessionId === null) return { splitSessionId: null }
        if (s.expandedSessionId === null || s.expandedSessionId === sessionId) return {}
        return { splitSessionId: sessionId }
      }),
    escape: () => {
      const { focusedSessionId, expandedSessionId, newSessionDialog } = get()
      if (newSessionDialog) {
        set({ newSessionDialog: null })
        return true
      }
      if (expandedSessionId && focusedSessionId === null) {
        set({ expandedSessionId: null, splitSessionId: null })
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
        ...withoutPane(s.expandedSessionId, s.splitSessionId, (id) => id === sessionId)
      })),
    show: (sessionId) =>
      set((s) => ({ hiddenSessionIds: s.hiddenSessionIds.filter((id) => id !== sessionId) })),
    openNewSessionDialog: (newSessionDialog) => set({ newSessionDialog }),
    closeNewSessionDialog: () => set({ newSessionDialog: null }),
    setError: (lastError) => set({ lastError }),
    setCenterView: (centerView) =>
      set((s) => ({
        centerView,
        // Analytics is a non-terminal zone (Constitution 3): no pane keeps keyboard focus behind it.
        focusedSessionId: centerView === 'sessions' ? s.focusedSessionId : null
      }))
  }))
}

/** Expanded (A) / split (B) after the panes matching `gone` leave: losing B ends the split, losing A promotes B. */
function withoutPane(
  expandedSessionId: string | null,
  splitSessionId: string | null,
  gone: (id: string) => boolean
): Pick<AppState, 'expandedSessionId' | 'splitSessionId'> {
  const split = splitSessionId !== null && !gone(splitSessionId) ? splitSessionId : null
  if (expandedSessionId !== null && !gone(expandedSessionId))
    return { expandedSessionId, splitSessionId: split }
  return { expandedSessionId: split, splitSessionId: null }
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
