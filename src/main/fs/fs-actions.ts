// File actions for the tree: open, reveal, copy, open in editor, native context menu (feature 002).
import { accessSync, constants, existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import {
  clipboard,
  Menu,
  shell,
  type BrowserWindow,
  type MenuItemConstructorOptions
} from 'electron'
import { relativeForShell } from '@shared/paths'

export interface EditorResolution {
  kind: 'code' | 'env' | 'default'
  /** Executable (for code/env) — undefined for 'default'. */
  command?: string
  args?: string[]
}

const VSCODE_APP_BIN = '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code'

/** Pure-ish (fs/env injectable): VS Code → $VISUAL/$EDITOR (GUI-ish) → system default. */
export function resolveEditor(opts: {
  env: NodeJS.ProcessEnv
  isExecutable?: (p: string) => boolean
}): EditorResolution {
  const isExec =
    opts.isExecutable ??
    ((p: string): boolean => {
      try {
        accessSync(p, constants.X_OK)
        return true
      } catch {
        return false
      }
    })
  for (const dir of (opts.env.PATH ?? '').split(':').filter(Boolean)) {
    const c = join(dir, 'code')
    if (isExec(c)) return { kind: 'code', command: c, args: ['--goto'] }
  }
  if (isExec(VSCODE_APP_BIN)) return { kind: 'code', command: VSCODE_APP_BIN, args: ['--goto'] }
  const env = (opts.env.VISUAL ?? opts.env.EDITOR ?? '').trim()
  if (env) {
    const [cmd, ...args] = env.split(/\s+/)
    // Terminal editors (vim/nano/emacs -nw) can't be launched from a GUI app; fall back to default.
    if (
      cmd &&
      !/(^|\/)(vi|vim|nvim|nano|emacs|pico|micro|helix|hx)$/.test(cmd) &&
      !args.includes('-nw')
    ) {
      return { kind: 'env', command: cmd, args }
    }
  }
  return { kind: 'default' }
}

export type ContextMenuAction =
  'reveal' | 'copyAbs' | 'copyRel' | 'openEditor' | 'open' | 'terminalHere'

/** Pure: menu template for a file/dir. Returned `action` ids are wired by the caller. */
export function buildContextMenuTemplate(opts: {
  isDir: boolean
  hasEditor: boolean
}): Array<{ label?: string; action?: ContextMenuAction; type?: 'separator' }> {
  const items: Array<{ label?: string; action?: ContextMenuAction; type?: 'separator' }> = [
    {
      label: opts.isDir ? 'Abrir carpeta (Finder)' : 'Abrir con la app por defecto',
      action: 'open'
    },
    { label: 'Revelar en Finder', action: 'reveal' },
    { type: 'separator' },
    { label: 'Copiar ruta absoluta', action: 'copyAbs' },
    { label: 'Copiar ruta relativa al proyecto', action: 'copyRel' },
    { type: 'separator' },
    {
      label: opts.hasEditor ? 'Abrir en editor' : 'Abrir en editor (app por defecto)',
      action: 'openEditor'
    }
  ]
  if (opts.isDir)
    items.push(
      { type: 'separator' },
      { label: 'Abrir terminal acá (nueva sesión de Claude)', action: 'terminalHere' }
    )
  return items
}

export class FsActions {
  constructor(private readonly env: NodeJS.ProcessEnv) {}

  async openPath(path: string): Promise<string> {
    return shell.openPath(path) // '' on success, error message otherwise
  }

  reveal(path: string): void {
    shell.showItemInFolder(path)
  }

  copy(text: string): void {
    clipboard.writeText(text)
  }

  async openInEditor(path: string): Promise<void> {
    const ed = resolveEditor({ env: this.env })
    if (ed.kind === 'default' || !ed.command) {
      await shell.openPath(path)
      return
    }
    const child = spawn(ed.command, [...(ed.args ?? []), path], {
      env: this.env,
      detached: true,
      stdio: 'ignore'
    })
    child.on('error', () => void shell.openPath(path))
    child.unref()
  }

  /** Show the native menu and run the chosen action. `onTerminalHere` is provided by the caller. */
  showContextMenu(
    win: BrowserWindow | null,
    req: { path: string; root: string; projectId: string; isDir: boolean },
    onTerminalHere: (projectId: string, cwd: string) => void
  ): void {
    const hasEditor = resolveEditor({ env: this.env }).kind !== 'default'
    const template: MenuItemConstructorOptions[] = buildContextMenuTemplate({
      isDir: req.isDir,
      hasEditor
    }).map((it) =>
      it.type === 'separator'
        ? { type: 'separator' }
        : {
            label: it.label,
            click: () => {
              switch (it.action) {
                case 'open':
                  void this.openPath(req.path)
                  break
                case 'reveal':
                  this.reveal(req.path)
                  break
                case 'copyAbs':
                  this.copy(req.path)
                  break
                case 'copyRel':
                  this.copy(relativeForShell(req.path, req.root))
                  break
                case 'openEditor':
                  void this.openInEditor(req.path)
                  break
                case 'terminalHere':
                  if (existsSync(req.path)) onTerminalHere(req.projectId, req.path)
                  break
              }
            }
          }
    )
    const menu = Menu.buildFromTemplate(template)
    menu.popup(win ? { window: win } : {})
  }
}
