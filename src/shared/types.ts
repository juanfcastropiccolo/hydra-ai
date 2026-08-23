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
    /** Display-name overrides chosen by the user (the CLI has no rename for bg sessions). */
    sessionNames: Record<string, string>
    /** Feature 002: file tree panel preferences. */
    fileTree: FileTreePrefs
  }
}

export interface FileTreePrefs {
  /** true = sidebar shows the Files view, false = Sessions view. */
  open: boolean
  /** Sidebar width in px (shared by both views, user-resizable). */
  width: number
  /** Sidebar collapsed to a thin rail (⌘B). */
  collapsed: boolean
}
export const DEFAULT_FILE_TREE_PREFS: FileTreePrefs = { open: false, width: 300, collapsed: false }
export const FILE_TREE_MIN_WIDTH = 200

/** One directory entry as listed by the main process (feature 002). */
export interface FsEntry {
  name: string
  kind: 'dir' | 'file' | 'symlink' | 'other'
  /** For symlinks: resolved target kind (dir/file) if readable. */
  symlinkKind?: 'dir' | 'file'
  unreadable?: boolean
}

export type GitStatus =
  'untracked' | 'modified' | 'added' | 'deleted' | 'renamed' | 'ignored' | 'conflict'

export interface GitStatusResult {
  /** Repo toplevel, or null if the folder is not inside a git repository. */
  root: string | null
  /** Keyed by path relative to `root`, '/'-separated. Directories end with '/'. */
  statuses: Record<string, GitStatus>
}

export const EMPTY_HYDRA_FILE: HydraFile = {
  version: 1,
  projects: [],
  ui: {
    hiddenSessionIds: [],
    paneOrder: [],
    sessionNames: {},
    fileTree: { open: false, width: 300, collapsed: false }
  }
}

/** Result of locating the Claude Code CLI at startup. */
export type ClaudeAvailability =
  | { ok: true; binaryPath: string; version?: string }
  | { ok: false; reason: 'not-found' | 'not-executable' | 'error'; message: string; hint: string }
