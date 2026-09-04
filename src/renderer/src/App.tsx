import { useEffect, useMemo, useState } from 'react'
import styles from './App.module.css'
import { ClaudeUnavailable } from './components/ClaudeUnavailable'
import { AnalyticsView } from './components/analytics/AnalyticsView'
import { GraphKnowView } from './components/know/GraphKnowView'
import { ConfigView } from './components/config/ConfigView'
import { applyAccent } from './components/config/accent'
import { usePrefs } from './store/prefs-slice'
import { ImportContextDialog } from './components/ImportContextDialog'
import { NewSessionDialog } from './components/NewSessionDialog'
import { ErrorBoundary } from './components/ErrorBoundary'
import { PaneGrid } from './components/PaneGrid'
import { TopbarSlotContext } from './lib/topbar-slot'
import { hydra } from './lib/hydra-client'
import { runImport } from './lib/import-flow'
import { fileTreeStore, useFileTree } from './store/file-tree-slice'
import { importContextStore } from './store/import-context-slice'
import { Sidebar } from './components/Sidebar'
import { initHydraClient } from './lib/hydra-client'
import { appStore, useAppStore } from './store/app-store'

function App(): React.JSX.Element {
  const availability = useAppStore((s) => s.availability)
  const projects = useAppStore((s) => s.projects)
  const lastError = useAppStore((s) => s.lastError)
  const setError = useAppStore((s) => s.setError)
  const escape = useAppStore((s) => s.escape)
  const centerView = useAppStore((s) => s.centerView)
  // A visible pane is expanded: its header takes over the topbar and the grid loses its padding.
  const paneExpanded = useAppStore(
    (s) =>
      s.expandedSessionId !== null &&
      s.sessions.some(
        (x) =>
          x.sessionId === s.expandedSessionId &&
          Boolean(x.bgId) &&
          !s.hiddenSessionIds.includes(x.sessionId)
      )
  )
  // Feature 008: B is shown next to A (split view) → the topbar splits in two halves.
  const paneSplit = useAppStore(
    (s) =>
      s.expandedSessionId !== null &&
      s.splitSessionId !== null &&
      s.sessions.some(
        (x) =>
          x.sessionId === s.splitSessionId &&
          Boolean(x.bgId) &&
          !s.hiddenSessionIds.includes(x.sessionId)
      )
  )
  // Published through TopbarSlotContext so the expanded/split Panes can portal their headers here.
  const [slotA, setSlotA] = useState<HTMLElement | null>(null)
  const [slotB, setSlotB] = useState<HTMLElement | null>(null)
  const topbarSlots = useMemo(() => ({ a: slotA, b: slotB }), [slotA, slotB])
  // feature 007: accent color → CSS vars (UI only)
  const accent = usePrefs((p) => p.appearance.accent)
  useEffect(() => {
    applyAccent(accent, document.documentElement)
  }, [accent])
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
    // feature 007: Preferencias… from the app menu
    const offConfig = hydra.onOpenConfig(() => {
      appStore.getState().setCenterView('config')
      void hydra.setCenterView('config')
    })
    return () => {
      offConfig()
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
      } else if (!e.shiftKey && e.key === ',') {
        // feature 007: ⌘, opens Config (standard macOS preferences shortcut)
        e.preventDefault()
        e.stopPropagation()
        appStore.getState().setCenterView('config')
        void hydra.setCenterView('config')
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
          {paneExpanded && centerView === 'sessions' ? (
            <>
              <div className={styles.topbarPane} ref={setSlotA} data-testid="topbar-pane" />
              {paneSplit && (
                <div
                  className={`${styles.topbarPane} ${styles.topbarPaneB}`}
                  ref={setSlotB}
                  data-testid="topbar-pane-b"
                />
              )}
            </>
          ) : (
            <>
              <span className={styles.topbarTitle} data-testid="topbar-title">
                {centerView === 'analytics'
                  ? 'Analytics'
                  : centerView === 'graph'
                    ? 'Graph Know'
                    : centerView === 'config'
                      ? 'Config'
                      : 'Sesiones'}
              </span>
              <span className={styles.topbarSpacer} />
              <span className={styles.topbarTitle} data-testid="claude-status">
                {availability === null
                  ? 'Claude Code: …'
                  : availability.ok
                    ? `Claude Code ${availability.version ?? ''}`
                    : 'Claude Code: no disponible'}
              </span>
            </>
          )}
        </header>
        {lastError && (
          <div className={styles.errorBanner} role="alert">
            <span>⚠️ {lastError}</span>
            <button onClick={() => setError(null)}>Cerrar</button>
          </div>
        )}
        <div className={styles.contentRow}>
          {/* Feature 005: the grid stays mounted (terminals keep their size) but hidden behind Analytics. */}
          <div
            className={`${styles.content} ${centerView !== 'sessions' ? styles.contentHidden : ''} ${paneExpanded ? styles.contentExpanded : ''}`}
            aria-hidden={centerView !== 'sessions'}
            data-testid="sessions-view"
          >
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
                <TopbarSlotContext.Provider value={topbarSlots}>
                  <PaneGrid />
                </TopbarSlotContext.Provider>
              </ErrorBoundary>
            )}
          </div>
          {centerView === 'analytics' && (
            <div
              className={`${styles.content} ${styles.contentAnalytics}`}
              data-testid="analytics-view"
            >
              <ErrorBoundary label="analytics">
                <AnalyticsView />
              </ErrorBoundary>
            </div>
          )}
          {centerView === 'config' && (
            <div
              className={`${styles.content} ${styles.contentAnalytics}`}
              data-testid="config-view"
            >
              <ErrorBoundary label="config">
                <ConfigView />
              </ErrorBoundary>
            </div>
          )}
          {centerView === 'graph' && (
            <div className={`${styles.content} ${styles.contentAnalytics}`} data-testid="know-view">
              <ErrorBoundary label="graph know">
                <GraphKnowView />
              </ErrorBoundary>
            </div>
          )}
        </div>
      </section>
      <NewSessionDialog />
      <ImportContextDialog onPick={(target, source) => void runImport(target, source)} />
    </div>
  )
}

export default App
