// Domain types shared by main and renderer. Keep this file free of Node/DOM imports.

/** A folder the user registered in the sidebar. Persisted in hydra.json. */
export interface Project {
  id: string
  name: string
  /** Absolute path. Sessions are matched to projects by cwd prefix. */
  path: string
  addedAt: string
  /** True when the folder no longer exists on disk (edge case: moved/deleted). */
  missing?: boolean
}

/**
 * Traffic-light state derived from the Claude Code CLI.
 *  working → 🟢  waiting → 🔴  idle → 🟡  ended → pane shows "finalizada"
 */
export type SessionState = 'working' | 'waiting' | 'idle' | 'ended'

export type SessionKind = 'background' | 'interactive'

/** Who the state came from; a hook always beats an older poll. */
export type StateSource = 'hook' | 'poll'

/** Runtime view of one Claude Code session. Never persisted — the CLI is the source of truth. */
export interface Session {
  /** Full session UUID. Primary key. */
  sessionId: string
  /** Short background id used by `claude attach/stop/rm`. Only present for kind=background. */
  bgId?: string
  kind: SessionKind
  name: string
  cwd: string
  /** Project this session belongs to (by cwd), or null if cwd is outside all registered projects. */
  projectId: string | null
  pid?: number
  startedAt: number
  state: SessionState
  /** Why the CLI reports it is waiting (e.g. "permission prompt", "input needed"). */
  waitingFor?: string
  lastStateAt: number
  source: StateSource
  /** 'hydra' if this app created it; 'external' if discovered (e.g. opened in iTerm). */
  origin: 'hydra' | 'external'
}

/** A terminal pane in the grid. One per attachable session the user hasn't hidden. */
export interface Pane {
  sessionId: string
  visible: boolean
  ptyId?: string
}

/** On-disk shape of hydra.json. Bump `version` on breaking changes and migrate. */
export interface HydraFile {
  version: 1
  projects: Project[]
  ui: {
    hiddenSessionIds: string[]
    paneOrder: string[]
  }
}

export const EMPTY_HYDRA_FILE: HydraFile = {
  version: 1,
  projects: [],
  ui: { hiddenSessionIds: [], paneOrder: [] }
}

/** Result of locating the Claude Code CLI at startup. */
export type ClaudeAvailability =
  | { ok: true; binaryPath: string; version?: string }
  | { ok: false; reason: 'not-found' | 'not-executable' | 'error'; message: string; hint: string }
