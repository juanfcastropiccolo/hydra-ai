// Minimal native application menu. NOTE: ⌘⇧E / ⌘B are handled in the renderer (capture phase,
// before xterm.js swallows them) — menu items here are plain entries so they never double-fire.
import { app, Menu, type MenuItemConstructorOptions } from 'electron'

export function installAppMenu(handlers: {
  toggleFileTree: () => void
  toggleSidebar: () => void
  /** Feature 007: Preferencias… (⌘, is handled in the renderer too; this entry is discoverable). */
  openConfig: () => void
}): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Preferencias… (⌘,)', click: () => handlers.openConfig() },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edición',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'Ver',
      submenu: [
        {
          label: 'Archivos (⌘⇧E)',
          click: () => handlers.toggleFileTree()
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Ventana',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
