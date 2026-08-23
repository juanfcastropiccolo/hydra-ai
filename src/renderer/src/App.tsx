import { useEffect } from 'react'
import styles from './App.module.css'
import { ClaudeUnavailable } from './components/ClaudeUnavailable'
import { ImportContextDialog } from './components/ImportContextDialog'
import { NewSessionDialog } from './components/NewSessionDialog'
import { ErrorBoundary } from './components/ErrorBoundary'
import { PaneGrid } from './components/PaneGrid'
import { hydra } from './lib/hydra-client'
import { runImport } from './lib/import-flow'
import { fileTreeStore, useFileTree } from './store/file-tree-slice'
import { importContextStore } from './store/import-context-slice'
import { Sidebar } from './components/Sidebar'
import { initHydraClient } from './lib/hydra-client'
import { useAppStore } from './store/app-store'

function App(): React.JSX.Element {
  const availability = useAppStore((s) => s.availability)
  const projects = useAppStore((s) => s.projects)
  const lastError = useAppStore((s) => s.lastError)
  const setError = useAppStore((s) => s.setError)
  const escape = useAppStore((s) => s.escape)
  const openDialog = useAppStore((s) => s.openNewSessionDialog)
  const sidebarCollapsed = useFileTree((s) => s.collapsed)

  useEffect(() => initHydraClient(), [])
  // feature 002: prefs + menu accelerator + "Abrir terminal acá"
  useEffect(() => {
    void hydra.getFileTree().then((p) => fileTreeStore.getState().setPrefs(p))
    const offToggle = hydra.onToggleFileTree(() => {
      fileTreeStore.getState().toggleOpen()
      void hydra.setFileTree({ open: fileTreeStore.getState().open })
    })
    const offSidebar = hydra.onToggleSidebar(() => {
      fileTreeStore.getState().toggleCollapsed()
      void hydra.setFileTree({ collapsed: fileTreeStore.getState().collapsed })
    })
    const offOpen = hydra.onOpenNewSession(async ({ projectId, cwd }) => {
      const suggestedName = await hydra.suggestSessionName(projectId)
      openDialog({ projectId, suggestedName, cwd })
    })
    return () => {
      offToggle()
      offSidebar()
      offOpen()
    }
  }, [openDialog])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      // Feature 004: the import dialog owns Esc while open (it closes itself).
      if (importContextStore.getState().dialogTargetId) {
        importContextStore.getState().closeDialog()
        e.preventDefault()
        return
      }
      if (escape()) e.preventDefault()
    }
    // App-level shortcuts in CAPTURE phase so they run before xterm.js (which would forward them to Claude).
    const onShortcut = (e: KeyboardEvent): void => {
      if (!e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (e.shiftKey && k === 'e') {
        e.preventDefault()
        e.stopPropagation()
        fileTreeStore
          .getState()
          .setPrefs({ open: !fileTreeStore.getState().open, collapsed: false })
        void hydra.setFileTree({ open: fileTreeStore.getState().open, collapsed: false })
      } else if (!e.shiftKey && k === 'b') {
        e.preventDefault()
        e.stopPropagation()
        fileTreeStore.getState().toggleCollapsed()
        void hydra.setFileTree({ collapsed: fileTreeStore.getState().collapsed })
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keydown', onShortcut, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keydown', onShortcut, true)
    }
  }, [escape])

  return (
    <div className={`${styles.shell} ${sidebarCollapsed ? styles.shellCollapsed : ''}`}>
      <Sidebar />
      <section className={styles.main}>
        <header className={styles.topbar}>
          <span className={styles.topbarTitle}>Sesiones</span>
          <span className={styles.topbarSpacer} />
          <span className={styles.topbarTitle} data-testid="claude-status">
            {availability === null
              ? 'Claude Code: …'
              : availability.ok
                ? `Claude Code ${availability.version ?? ''}`
                : 'Claude Code: no disponible'}
          </span>
        </header>
        {lastError && (
          <div className={styles.errorBanner} role="alert">
            <span>⚠️ {lastError}</span>
            <button onClick={() => setError(null)}>Cerrar</button>
          </div>
        )}
        <div className={styles.contentRow}>
          <div className={styles.content}>
            {availability && !availability.ok ? (
              <ClaudeUnavailable availability={availability} />
            ) : projects.length === 0 ? (
              <div className={styles.empty} data-testid="empty-state">
                <h2>Sin proyectos todavía</h2>
                <p>
                  Agregá una carpeta desde el panel de la izquierda para empezar a crear sesiones.
                </p>
              </div>
            ) : (
              <ErrorBoundary label="la grilla">
                <PaneGrid />
              </ErrorBoundary>
            )}
          </div>
        </div>
      </section>
      <NewSessionDialog />
      <ImportContextDialog onPick={(target, source) => void runImport(target, source)} />
    </div>
  )
}

export default App
