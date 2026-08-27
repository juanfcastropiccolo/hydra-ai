import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { AppContext } from './app-context'
import { installAppMenu } from './app-menu'
import { registerIpc, type E2EHooks } from './ipc'
import { createFakePtySpawn, FakeClaudeCli } from './testing/fakes'

let mainWindow: BrowserWindow | null = null
let ctx: AppContext | null = null

function createWindow(zoomLevel: number, onZoomSaved: (level: number) => void): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Hydra AI',
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  // Open maximized (Juan's request, 2026-08-23) and with the last zoom level (default one step down).
  win.on('ready-to-show', () => {
    win.maximize()
    win.show()
  })
  win.webContents.on('did-finish-load', () => win.webContents.setZoomLevel(zoomLevel))
  win.on('close', () => onZoomSaved(win.webContents.getZoomLevel()))
  win.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

process.on('uncaughtException', (e) => {
  console.error('[main] uncaught', e)
  ctx?.errors.push('main', e)
})

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('ai.hydra.app')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  const e2e = process.env['HYDRA_E2E'] === '1'
  const userData = process.env['HYDRA_USER_DATA'] ?? app.getPath('userData')
  let e2eHooks: E2EHooks | undefined
  if (e2e) {
    const fakeCli = new FakeClaudeCli()
    const fakePty = createFakePtySpawn()
    ctx = new AppContext({
      hydraFilePath: join(userData, 'hydra.json'),
      analyticsCachePath: join(userData, 'analytics-index.json'),
      knowCardsPath: join(userData, 'know-cards.json'),
      mcpPort: 0,
      claudeProjectsRoot: process.env['HYDRA_E2E_CLAUDE_PROJECTS'] ?? join(userData, 'no-projects'),
      fakeCli,
      ptySpawn: fakePty.spawn,
      pollMs: 300
    })
    e2eHooks = {
      ptyRecords: () => [...fakePty.records.entries()].map(([pid, r]) => ({ pid, ...r })),
      setStatus: (bgId, status, waitingFor) => fakeCli.setStatus(bgId, status, waitingFor)
    }
  } else {
    ctx = new AppContext({
      hydraFilePath: join(userData, 'hydra.json'),
      analyticsCachePath: join(userData, 'analytics-index.json'),
      knowCardsPath: join(userData, 'know-cards.json'),
      fakeNoClaude: process.env['HYDRA_FAKE_NO_CLAUDE'] === '1'
    })
  }
  registerIpc(ctx, () => mainWindow, e2eHooks)
  installAppMenu({
    toggleFileTree: () => ctx?.broadcast('ui.toggleFileTree', {}),
    toggleSidebar: () => ctx?.broadcast('ui.toggleSidebar', {})
  })
  await ctx.init()

  mainWindow = createWindow(ctx.store.zoomLevel(), (level) => ctx?.store.setZoomLevel(level))
  ctx.attachWindow(mainWindow)
  // Push initial availability once the renderer is listening.
  mainWindow.webContents.on('did-finish-load', () => {
    ctx?.broadcast('claude.availability', ctx.availability)
    ctx?.broadcast('projects.changed', { projects: ctx.store.listProjects() })
    ctx?.broadcast('sessions.changed', { sessions: ctx.sessions() })
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && ctx) {
      mainWindow = createWindow(ctx.store.zoomLevel(), (level) => ctx?.store.setZoomLevel(level))
      ctx.attachWindow(mainWindow)
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  // Kills only our attach clients; Claude sessions keep running in the daemon (FR-10).
  void ctx?.dispose()
})
