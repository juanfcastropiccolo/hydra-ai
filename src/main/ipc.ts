// Registers every channel of the typed IPC contract against the AppContext.
import { dialog, ipcMain, shell, type BrowserWindow } from 'electron'
import type { InvokeArgs, InvokeChannel, InvokeResult, IpcSend, SendChannel } from '@shared/ipc'
import type { AppContext } from './app-context'
import { exportHydraJson } from './maintenance'

function handle<C extends InvokeChannel>(
  channel: C,
  fn: (...args: InvokeArgs<C>) => Promise<InvokeResult<C>> | InvokeResult<C>
): void {
  ipcMain.handle(channel, (_e, ...args) => fn(...(args as InvokeArgs<C>)))
}
function on<C extends SendChannel>(channel: C, fn: (payload: IpcSend[C]) => void): void {
  ipcMain.on(channel, (_e, payload) => fn(payload as IpcSend[C]))
}

export interface E2EHooks {
  spawns: () => Array<{
    cwd: string
    name: string
    model?: string
    effort?: string
    permissionMode?: string
  }>
  ptyRecords: () => Array<{
    pid: number
    args: string[]
    writes: string[]
    resizes: Array<{ cols: number; rows: number }>
    killed: boolean
  }>
  setStatus: (bgId: string, status: string, waitingFor?: string) => void
}

export function registerIpc(
  ctx: AppContext,
  getWindow: () => BrowserWindow | null,
  e2e?: E2EHooks
): void {
  handle('e2e.ptyRecords', () => {
    if (!e2e) throw new Error('E2E hooks not enabled')
    return e2e.ptyRecords()
  })
  handle('e2e.spawns', () => {
    if (!e2e) throw new Error('E2E only')
    return e2e.spawns()
  })
  handle('e2e.setStatus', ({ bgId, status, waitingFor }) => {
    if (!e2e) throw new Error('E2E hooks not enabled')
    e2e.setStatus(bgId, status, waitingFor)
    void ctx.watcher?.poll()
  })

  handle('claude.availability', () => ctx.availability)

  handle('projects.list', () => ctx.store.listProjects())
  handle('projects.add', ({ path, name }) => {
    const p = ctx.store.addProject({ path, name })
    ctx.watcher?.refreshProjectIndex()
    ctx.broadcast('projects.changed', { projects: ctx.store.listProjects() })
    return p
  })
  handle('projects.remove', ({ id }) => {
    ctx.store.removeProject(id)
    ctx.watcher?.refreshProjectIndex()
    ctx.broadcast('projects.changed', { projects: ctx.store.listProjects() })
  })
  handle('projects.setColor', ({ id, color }) => {
    const p = ctx.store.setProjectColor(id, color)
    ctx.broadcast('projects.changed', { projects: ctx.store.listProjects() })
    return p
  })
  handle('projects.rename', ({ id, name }) => {
    const p = ctx.store.renameProject(id, name)
    ctx.broadcast('projects.changed', { projects: ctx.store.listProjects() })
    return p
  })
  handle('projects.pickFolder', async () => {
    if (process.env['HYDRA_E2E_PICK_FOLDER']) return process.env['HYDRA_E2E_PICK_FOLDER']
    const win = getWindow()
    const opts: Electron.OpenDialogOptions = {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Elegí la carpeta del proyecto'
    }
    const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    return r.canceled ? null : (r.filePaths[0] ?? null)
  })

  handle('sessions.list', () => ctx.sessions())
  handle('sessions.suggestName', ({ projectId }) => ctx.suggestSessionName(projectId))
  handle('sessions.create', ({ projectId, name, cwd }) => ctx.createSession(projectId, name, cwd))
  handle('sessions.stop', ({ sessionId }) => ctx.stopSession(sessionId))
  handle('sessions.rename', ({ sessionId, name }) => ctx.renameSession(sessionId, name))

  handle('pty.open', ({ sessionId, cols, rows }) => ({ ptyId: ctx.openPty(sessionId, cols, rows) }))
  handle('pty.close', ({ ptyId }) => ctx.closePty(ptyId))
  handle('pty.scrollback', ({ ptyId }) => ctx.pty.scrollback(ptyId))
  on('pty.write', ({ ptyId, data }) => ctx.pty.write(ptyId, data))
  on('pty.resize', ({ ptyId, cols, rows }) => ctx.pty.resize(ptyId, cols, rows))

  // ---- feature 002: file tree ----
  handle('fs.list', ({ dir }) => ctx.fs.list(dir))
  handle('fs.listRecursive', async ({ root, limit }) => {
    const git = await ctx.git.status(root)
    const ignored = new Set(
      Object.entries(git.statuses)
        .filter(([, s]) => s === 'ignored')
        .map(([p]) => p)
    )
    const all = await ctx.fs.listRecursive(root, { limit, skipDirs: ignored })
    return all.filter((p) => !ignored.has(p) && !ignored.has(p.replace(/\/$/, '')))
  })
  handle('fs.watch', ({ root }) => ctx.fs.watch(root))
  handle('fs.unwatch', ({ root }) => ctx.fs.unwatch(root))
  handle('fs.open', ({ path }) => ctx.fsActions.openPath(path))
  handle('fs.reveal', ({ path }) => ctx.fsActions.reveal(path))
  handle('fs.copyPath', ({ path }) => ctx.fsActions.copy(path))
  handle('fs.openInEditor', ({ path }) => ctx.fsActions.openInEditor(path))
  handle('fs.contextMenu', (req) =>
    ctx.fsActions.showContextMenu(getWindow(), req, (projectId, cwd) =>
      ctx.broadcast('ui.openNewSession', { projectId, cwd })
    )
  )
  handle('git.status', ({ dir }) => ctx.git.status(dir))

  // ---- feature 004: import context ----
  handle('context.summarize', async ({ importId, sourceSessionId }) => {
    if (!ctx.importer)
      throw new Error(ctx.availability.ok ? 'CLI not initialised' : ctx.availability.message)
    try {
      return await ctx.importer.summarize({ importId, sourceSessionId })
    } catch (e) {
      if ((e as Error).name !== 'ImportCancelledError')
        ctx.errors.push('importar contexto', e as Error)
      throw e
    }
  })
  handle('context.cancel', ({ importId }) => ctx.importer?.cancel(importId))

  // ---- feature 005: analytics ----
  handle('analytics.open', async () => ({
    ...(await ctx.analyticsIndexer().open()),
    now: ctx.analyticsNow()
  }))
  handle('analytics.close', () => ctx.analyticsIndexer().close())
  handle('analytics.reindex', () => ctx.analyticsIndexer().reindex())

  // ---- feature 007: unified prefs ----
  handle('prefs.get', () => ctx.store.prefs())
  handle('prefs.set', (patch) => ctx.setPrefs(patch))
  handle('maint.errors', () => ctx.errors.list())
  handle('maint.info', () => ctx.maintInfo())
  handle('maint.redetectCli', () => ctx.redetectCli())
  handle('maint.openDataDir', () => {
    shell.showItemInFolder(ctx.store.filePath)
  })
  handle('maint.exportHydraJson', async () => {
    const win = getWindow()
    const opts = {
      title: 'Exportar hydra.json',
      defaultPath: `hydra-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    }
    const r = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
    if (r.canceled || !r.filePath) return null
    exportHydraJson(ctx.store.filePath, r.filePath)
    return r.filePath
  })
  handle('maint.importHydraJson', async () => {
    const win = getWindow()
    const opts = {
      title: 'Importar hydra.json',
      properties: ['openFile' as const],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    }
    const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    const src = r.filePaths[0]
    if (r.canceled || !src) return null
    return ctx.importHydraJson(src)
  })
  handle('maint.clearCards', () => ctx.clearCards())
  handle('maint.clearAnalyticsCache', () => ctx.clearAnalyticsCache())
  handle('maint.reindex', () => ctx.analyticsIndexer().reindex())

  // ---- feature 006: graph know ----
  handle('know.open', () => ctx.knowOpen())
  handle('know.close', () => {
    /* index/watcher shared with analytics; MCP keeps serving while the app runs */
  })
  handle('know.status', () => ctx.knowStatus())
  handle('know.search', (q) =>
    ctx.knowLayer().know.search(q, {
      liveSessionIds: new Set((ctx.watcher?.list() ?? []).map((s) => s.sessionId))
    })
  )
  handle('know.card', ({ sessionId }) => ctx.knowLayer().know.card(sessionId) ?? null)
  handle('know.generatePending', () => {
    ctx.knowLayer().queue.approveBackfill()
  })
  handle('know.generateOne', ({ sessionId }) => ctx.knowLayer().queue.generateOne(sessionId))
  handle('know.connectMcp', () => ctx.knowConnectMcp())
  handle('know.disconnectMcp', () => ctx.knowDisconnectMcp())
  handle('know.graph', (opts) => ctx.knowLayer().know.graphSlice(opts))

  handle('ui.getHidden', () => ctx.store.hiddenSessionIds())
  handle('ui.setHidden', ({ sessionId, hidden }) => ctx.store.setHidden(sessionId, hidden))
}
