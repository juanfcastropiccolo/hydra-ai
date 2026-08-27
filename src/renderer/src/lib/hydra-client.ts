// Bridges window.hydra (preload) with the zustand store. Call initHydraClient() once at boot.
import { appStore } from '../store/app-store'
import { prefsStore } from '../store/prefs-slice'

let started = false

export function initHydraClient(): () => void {
  if (started) return () => {}
  started = true
  const st = appStore.getState()
  const offs = [
    window.hydra.on('claude.availability', (a) => appStore.getState().setAvailability(a)),
    window.hydra.on('projects.changed', (e) => appStore.getState().setProjects(e.projects)),
    window.hydra.on('sessions.changed', (e) => appStore.getState().setSessions(e.sessions)),
    window.hydra.on('prefs.changed', (p) => prefsStore.getState().setPrefs(p))
  ]
  void window.hydra.invoke('prefs.get').then((p) => prefsStore.getState().setPrefs(p))
  void window.hydra.invoke('claude.availability').then(st.setAvailability)
  void window.hydra.invoke('projects.list').then(st.setProjects)
  void window.hydra.invoke('sessions.list').then(st.setSessions)
  void window.hydra.invoke('ui.getHidden').then(st.setHidden)
  void window.hydra.invoke('ui.getCenterView').then((v) => appStore.getState().setCenterView(v))
  return () => {
    offs.forEach((off) => off())
    started = false
  }
}

/** Thin helpers so components never touch window.hydra directly. */
export const hydra = {
  pickFolder: () => window.hydra.invoke('projects.pickFolder'),
  addProject: (path: string, name?: string) => window.hydra.invoke('projects.add', { path, name }),
  removeProject: (id: string) => window.hydra.invoke('projects.remove', { id }),
  renameProject: (id: string, name: string) => window.hydra.invoke('projects.rename', { id, name }),
  setProjectColor: (id: string, color: import('@shared/types').ProjectColor | null) =>
    window.hydra.invoke('projects.setColor', { id, color }),
  suggestSessionName: (projectId: string) =>
    window.hydra.invoke('sessions.suggestName', { projectId }),
  createSession: (projectId: string, name: string, cwd?: string) =>
    window.hydra.invoke('sessions.create', { projectId, name, cwd }),
  stopSession: (sessionId: string) => window.hydra.invoke('sessions.stop', { sessionId }),
  renameSession: (sessionId: string, name: string) =>
    window.hydra.invoke('sessions.rename', { sessionId, name }),
  setHidden: (sessionId: string, hidden: boolean) =>
    window.hydra.invoke('ui.setHidden', { sessionId, hidden }),
  openPty: (sessionId: string, cols: number, rows: number) =>
    window.hydra.invoke('pty.open', { sessionId, cols, rows }),
  closePty: (ptyId: string) => window.hydra.invoke('pty.close', { ptyId }),
  scrollback: (ptyId: string) => window.hydra.invoke('pty.scrollback', { ptyId }),
  write: (ptyId: string, data: string) => window.hydra.send('pty.write', { ptyId, data }),
  resize: (ptyId: string, cols: number, rows: number) =>
    window.hydra.send('pty.resize', { ptyId, cols, rows }),
  // feature 002
  fsList: (dir: string) => window.hydra.invoke('fs.list', { dir }),
  fsListRecursive: (root: string, limit?: number) =>
    window.hydra.invoke('fs.listRecursive', { root, limit }),
  fsWatch: (root: string) => window.hydra.invoke('fs.watch', { root }),
  fsUnwatch: (root: string) => window.hydra.invoke('fs.unwatch', { root }),
  fsOpen: (path: string) => window.hydra.invoke('fs.open', { path }),
  fsReveal: (path: string) => window.hydra.invoke('fs.reveal', { path }),
  fsCopyPath: (path: string) => window.hydra.invoke('fs.copyPath', { path }),
  fsOpenInEditor: (path: string) => window.hydra.invoke('fs.openInEditor', { path }),
  fsContextMenu: (req: { path: string; root: string; projectId: string; isDir: boolean }) =>
    window.hydra.invoke('fs.contextMenu', req),
  gitStatus: (dir: string) => window.hydra.invoke('git.status', { dir }),
  getFileTree: () => window.hydra.invoke('ui.getFileTree'),
  setFileTree: (patch: { open?: boolean; width?: number; collapsed?: boolean }) =>
    window.hydra.invoke('ui.setFileTree', patch),
  onToggleSidebar: (cb: () => void) => window.hydra.on('ui.toggleSidebar', cb),
  // feature 005
  analyticsOpen: () => window.hydra.invoke('analytics.open'),
  analyticsClose: () => window.hydra.invoke('analytics.close'),
  analyticsReindex: () => window.hydra.invoke('analytics.reindex'),
  getAnalytics: () => window.hydra.invoke('ui.getAnalytics'),
  setAnalytics: (patch: Partial<import('@shared/analytics/types').AnalyticsPrefs>) =>
    window.hydra.invoke('ui.setAnalytics', patch),
  setCenterView: (view: import('@shared/analytics/types').CenterView) =>
    window.hydra.invoke('ui.setCenterView', view),
  onAnalyticsProgress: (cb: (p: import('@shared/analytics/types').AnalyticsProgress) => void) =>
    window.hydra.on('analytics.progress', cb),
  onAnalyticsSessions: (
    cb: (e: { sessions: import('@shared/analytics/types').SessionSummary[]; now: number }) => void
  ) => window.hydra.on('analytics.sessions', cb),
  // feature 007
  getPrefs: () => window.hydra.invoke('prefs.get'),
  setPrefs: (patch: import('@shared/prefs').PrefsPatch) => window.hydra.invoke('prefs.set', patch),
  onOpenConfig: (cb: () => void) => window.hydra.on('ui.openConfig', cb),
  maintInfo: () => window.hydra.invoke('maint.info'),
  maintErrors: () => window.hydra.invoke('maint.errors'),
  maintRedetectCli: () => window.hydra.invoke('maint.redetectCli'),
  maintOpenDataDir: () => window.hydra.invoke('maint.openDataDir'),
  maintExportHydraJson: () => window.hydra.invoke('maint.exportHydraJson'),
  maintImportHydraJson: () => window.hydra.invoke('maint.importHydraJson'),
  maintClearCards: () => window.hydra.invoke('maint.clearCards'),
  maintClearAnalyticsCache: () => window.hydra.invoke('maint.clearAnalyticsCache'),
  maintReindex: () => window.hydra.invoke('maint.reindex'),
  // feature 006
  knowOpen: () => window.hydra.invoke('know.open'),
  knowStatus: () => window.hydra.invoke('know.status'),
  knowSearch: (q: import('@shared/know/types').KnowSearchQuery) =>
    window.hydra.invoke('know.search', q),
  knowCard: (sessionId: string) => window.hydra.invoke('know.card', { sessionId }),
  knowGeneratePending: () => window.hydra.invoke('know.generatePending'),
  knowGenerateOne: (sessionId: string) => window.hydra.invoke('know.generateOne', { sessionId }),
  knowGetPrefs: () => window.hydra.invoke('know.getPrefs'),
  knowSetPrefs: (patch: Partial<import('@shared/know/types').KnowPrefs>) =>
    window.hydra.invoke('know.setPrefs', patch),
  knowConnectMcp: () => window.hydra.invoke('know.connectMcp'),
  knowDisconnectMcp: () => window.hydra.invoke('know.disconnectMcp'),
  knowGraph: (opts: { expand?: string[]; limit?: number }) =>
    window.hydra.invoke('know.graph', opts),
  onKnowStatus: (cb: (s: import('@shared/know/types').KnowStatus) => void) =>
    window.hydra.on('know.status', cb),
  // feature 004
  summarizeContext: (importId: string, sourceSessionId: string) =>
    window.hydra.invoke('context.summarize', { importId, sourceSessionId }),
  cancelImport: (importId: string) => window.hydra.invoke('context.cancel', { importId }),
  getImportContext: () => window.hydra.invoke('ui.getImportContext'),
  setImportContext: (patch: { model?: string }) =>
    window.hydra.invoke('ui.setImportContext', patch),
  onFsChanged: (cb: (e: { root: string; dirs: string[]; all: boolean }) => void) =>
    window.hydra.on('fs.changed', cb),
  onGitChanged: (
    cb: (e: { root: string; result: import('@shared/types').GitStatusResult }) => void
  ) => window.hydra.on('git.changed', cb),
  onToggleFileTree: (cb: () => void) => window.hydra.on('ui.toggleFileTree', cb),
  onOpenNewSession: (cb: (e: { projectId: string; cwd: string }) => void) =>
    window.hydra.on('ui.openNewSession', cb),
  onPtyData: (cb: (e: { ptyId: string; data: string }) => void) => window.hydra.on('pty.data', cb),
  onPtyExit: (cb: (e: { ptyId: string; exitCode: number }) => void) =>
    window.hydra.on('pty.exit', cb)
}
