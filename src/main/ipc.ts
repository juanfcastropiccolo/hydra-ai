// Registers every channel of the typed IPC contract against the AppContext.
import { dialog, ipcMain, type BrowserWindow } from 'electron'
import type { InvokeArgs, InvokeChannel, InvokeResult, IpcSend, SendChannel } from '@shared/ipc'
import type { AppContext } from './app-context'

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
  handle('ui.getFileTree', () => ctx.store.fileTree())
  handle('ui.setFileTree', (patch) => ctx.store.setFileTree(patch))

  handle('ui.getHidden', () => ctx.store.hiddenSessionIds())
  handle('ui.setHidden', ({ sessionId, hidden }) => ctx.store.setHidden(sessionId, hidden))
}
