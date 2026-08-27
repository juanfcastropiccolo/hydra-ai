// Typed IPC contract between main and renderer. Both sides import from here;
// nothing crosses the bridge that is not described in these two maps.
import type { HydraPrefs, PrefsPatch } from './prefs'
import type {
  KnowPrefs,
  KnowSearchHit,
  KnowSearchQuery,
  KnowStatus,
  SessionCard
} from './know/types'
import type {
  AnalyticsPrefs,
  AnalyticsProgress,
  CenterView,
  SessionSummary
} from './analytics/types'
import type {
  ClaudeAvailability,
  FileTreePrefs,
  FsEntry,
  GitStatusResult,
  ImportContextPrefs,
  Project,
  ProjectColor,
  Session
} from './types'

/** Request/response channels (renderer → main, via ipcRenderer.invoke). */
export interface IpcInvoke {
  'projects.list': { args: []; result: Project[] }
  'projects.add': { args: [{ path: string; name?: string }]; result: Project }
  'projects.remove': { args: [{ id: string }]; result: void }
  'projects.rename': { args: [{ id: string; name: string }]; result: Project }
  'projects.setColor': { args: [{ id: string; color: ProjectColor | null }]; result: Project }
  /** Opens the native folder picker; resolves null if the user cancelled. */
  'projects.pickFolder': { args: []; result: string | null }

  'sessions.list': { args: []; result: Session[] }
  /** `cwd` (feature 002 'Abrir terminal acá') must live inside a registered project; defaults to the project path. */
  'sessions.create': { args: [{ projectId: string; name: string; cwd?: string }]; result: Session }
  'sessions.stop': { args: [{ sessionId: string }]; result: void }
  'sessions.rename': { args: [{ sessionId: string; name: string }]; result: void }
  'sessions.suggestName': { args: [{ projectId: string }]; result: string }

  /** Attach a PTY to a session; returns the pty id to use in pty.* calls. */
  'pty.open': {
    args: [{ sessionId: string; cols: number; rows: number }]
    result: { ptyId: string }
  }
  'pty.close': { args: [{ ptyId: string }]; result: void }
  /** Replays the buffered scrollback (last N KB) so a remounted pane is not blank. */
  'pty.scrollback': { args: [{ ptyId: string }]; result: string }

  'ui.getHidden': { args: []; result: string[] }
  'ui.setHidden': { args: [{ sessionId: string; hidden: boolean }]; result: void }

  'claude.availability': { args: []; result: ClaudeAvailability }

  // ---- feature 002: file tree ----
  'fs.list': { args: [{ dir: string }]; result: FsEntry[] }
  /** Bounded recursive listing for the quick filter (skips .git, node_modules and git-ignored dirs). */
  'fs.listRecursive': { args: [{ root: string; limit?: number }]; result: string[] }
  'fs.watch': { args: [{ root: string }]; result: void }
  'fs.unwatch': { args: [{ root: string }]; result: void }
  'fs.open': { args: [{ path: string }]; result: string }
  'fs.reveal': { args: [{ path: string }]; result: void }
  'fs.copyPath': { args: [{ path: string }]; result: void }
  'fs.openInEditor': { args: [{ path: string }]; result: void }
  'fs.contextMenu': {
    args: [{ path: string; root: string; projectId: string; isDir: boolean }]
    result: void
  }
  'git.status': { args: [{ dir: string }]; result: GitStatusResult }
  'ui.getFileTree': { args: []; result: FileTreePrefs }
  'ui.setFileTree': { args: [Partial<FileTreePrefs>]; result: FileTreePrefs }

  // ---- feature 004: import context ----
  /**
   * Summarise another session's conversation for pasting into a target pane. Resolves with the
   * full block to paste (intro + summary). Rejects with message 'cancelled' when cancelled via
   * `context.cancel`. Never writes to any PTY — the renderer does the paste.
   */
  'context.summarize': {
    args: [{ importId: string; sourceSessionId: string }]
    result: { text: string; truncated: boolean; model: string; durationMs: number }
  }
  'context.cancel': { args: [{ importId: string }]; result: void }
  'ui.getImportContext': { args: []; result: ImportContextPrefs }
  'ui.setImportContext': { args: [Partial<ImportContextPrefs>]; result: ImportContextPrefs }

  // ---- feature 005: analytics ----
  /**
   * Start (or refresh) the transcript index. Resolves at once with whatever the cache holds;
   * `analytics.progress` / `analytics.sessions` events follow while the scan runs, and the
   * directory is watched until `analytics.close`.
   */
  'analytics.open': {
    args: []
    /** `now` = main's clock (E2E can pin it via HYDRA_E2E_NOW) so the renderer stays pure. */
    result: { sessions: SessionSummary[]; fromCache: boolean; now: number }
  }
  'analytics.close': { args: []; result: void }
  /** Drop the cache and rebuild (progress/sessions events as in open). */
  'analytics.reindex': { args: []; result: void }
  'ui.getAnalytics': { args: []; result: AnalyticsPrefs }
  'ui.setAnalytics': { args: [Partial<AnalyticsPrefs>]; result: AnalyticsPrefs }
  'ui.getCenterView': { args: []; result: CenterView }
  'ui.setCenterView': { args: [CenterView]; result: CenterView }

  // ---- feature 007: unified preferences ----
  'prefs.get': { args: []; result: HydraPrefs }
  /** Field-level validation; invalid fields are ignored. Side effects (MCP port, card queue) run in main. */
  'prefs.set': { args: [PrefsPatch]; result: HydraPrefs }
  /** Recent main-process errors, newest first (Config › Mantenimiento). */
  'maint.errors': { args: []; result: Array<{ ts: number; source: string; message: string }> }

  // ---- feature 006: graph know ----
  /** Opens/refreshes the knowledge layer (piggybacks on the analytics index) and starts the MCP server. */
  'know.open': { args: []; result: KnowStatus }
  'know.close': { args: []; result: void }
  'know.status': { args: []; result: KnowStatus }
  'know.search': { args: [KnowSearchQuery]; result: KnowSearchHit[] }
  'know.card': { args: [{ sessionId: string }]; result: SessionCard | null }
  /** Approve the initial backfill (or force-generate everything pending). */
  'know.generatePending': { args: []; result: void }
  'know.generateOne': { args: [{ sessionId: string }]; result: boolean }
  'know.setPrefs': { args: [Partial<KnowPrefs>]; result: KnowPrefs }
  'know.getPrefs': { args: []; result: KnowPrefs }
  'know.connectMcp': { args: []; result: KnowStatus }
  'know.disconnectMcp': { args: []; result: KnowStatus }
  /** Graph slice for the visual canvas: top nodes + edges, or the neighbourhood of `expand`. */
  'know.graph': {
    args: [{ expand?: string[]; limit?: number }]
    result: {
      nodes: Array<{
        id: string
        label: string
        kind: 'project' | 'session' | 'file' | 'topic' | 'fact'
        weight: number
      }>
      edges: Array<{ a: string; b: string; w: number }>
    }
  }

  /** E2E only (HYDRA_E2E=1): what each fake PTY received. Rejects otherwise. */
  'e2e.ptyRecords': {
    args: []
    result: Array<{
      pid: number
      args: string[]
      writes: string[]
      resizes: Array<{ cols: number; rows: number }>
      killed: boolean
    }>
  }
  /** E2E only: flip a fake session's status so the traffic light changes. */
  'e2e.setStatus': { args: [{ bgId: string; status: string; waitingFor?: string }]; result: void }
}

/** Fire-and-forget messages (renderer → main, via ipcRenderer.send). */
export interface IpcSend {
  'pty.write': { ptyId: string; data: string }
  'pty.resize': { ptyId: string; cols: number; rows: number }
}

/** Push events (main → renderer, via webContents.send). */
export interface IpcEvents {
  'pty.data': { ptyId: string; data: string }
  'pty.exit': { ptyId: string; exitCode: number }
  'sessions.changed': { sessions: Session[] }
  'projects.changed': { projects: Project[] }
  'claude.availability': ClaudeAvailability
  // ---- feature 002 ----
  /** Directories whose listing may have changed (absolute). `all: true` = re-list every expanded dir. */
  'fs.changed': { root: string; dirs: string[]; all: boolean }
  'git.changed': { root: string; result: GitStatusResult }
  'ui.toggleFileTree': Record<string, never>
  'ui.toggleSidebar': Record<string, never>
  'ui.openNewSession': { projectId: string; cwd: string }
  // ---- feature 005 ----
  'analytics.progress': AnalyticsProgress
  /** Full current list (temp-dir sessions already excluded). */
  'analytics.sessions': { sessions: SessionSummary[]; now: number }
  // ---- feature 006 ----
  'know.status': KnowStatus
  // ---- feature 007 ----
  'prefs.changed': HydraPrefs
  'ui.openConfig': Record<string, never>
}

export type InvokeChannel = keyof IpcInvoke
export type SendChannel = keyof IpcSend
export type EventChannel = keyof IpcEvents

export type InvokeArgs<C extends InvokeChannel> = IpcInvoke[C]['args']
export type InvokeResult<C extends InvokeChannel> = IpcInvoke[C]['result']

/** Shape exposed on `window.hydra` by the preload script. */
export interface HydraApi {
  invoke<C extends InvokeChannel>(channel: C, ...args: InvokeArgs<C>): Promise<InvokeResult<C>>
  send<C extends SendChannel>(channel: C, payload: IpcSend[C]): void
  on<C extends EventChannel>(channel: C, listener: (payload: IpcEvents[C]) => void): () => void
}
