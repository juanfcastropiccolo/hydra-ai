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

export function registerIpc(ctx: AppContext, getWindow: () => BrowserWindow | null): void {
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
  handle('sessions.create', ({ projectId, name }) => ctx.createSession(projectId, name))
  handle('sessions.stop', ({ sessionId }) => ctx.stopSession(sessionId))
  handle('sessions.rename', () => {
    // The CLI has no rename for bg sessions yet; v1 keeps the name chosen at creation. (FR-6 partial)
    throw new Error('Renombrar sesiones no está soportado por el CLI de Claude Code todavía')
  })

  handle('pty.open', ({ sessionId, cols, rows }) => ({ ptyId: ctx.openPty(sessionId, cols, rows) }))
  handle('pty.close', ({ ptyId }) => ctx.closePty(ptyId))
  handle('pty.scrollback', ({ ptyId }) => ctx.pty.scrollback(ptyId))
  on('pty.write', ({ ptyId, data }) => ctx.pty.write(ptyId, data))
  on('pty.resize', ({ ptyId, cols, rows }) => ctx.pty.resize(ptyId, cols, rows))

  handle('ui.getHidden', () => ctx.store.hiddenSessionIds())
  handle('ui.setHidden', ({ sessionId, hidden }) => ctx.store.setHidden(sessionId, hidden))
}
