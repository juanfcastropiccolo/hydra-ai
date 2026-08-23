import styles from './Sidebar.module.css'
import badge from '../assets/brand/hydra-badge.png'
import wordmark from '../assets/brand/hydra-wordmark-dark.png'
import { useState } from 'react'
import { FILE_TREE_MIN_WIDTH } from '@shared/types'
import { hydra } from '../lib/hydra-client'
import { fileTreeStore, useFileTree } from '../store/file-tree-slice'
import { ErrorBoundary } from './ErrorBoundary'
import { FileTreePanel } from './file-tree/FileTreePanel'
import { ProjectList } from './ProjectList'

const NAV = [
  { key: 'sessions', label: 'Sessions', enabled: true },
  { key: 'analytics', label: 'Analytics', enabled: false },
  { key: 'graph', label: 'Graph Know', enabled: false },
  { key: 'config', label: 'Config', enabled: false }
] as const

const SIDEBAR_DEFAULT_W = 260

export function Sidebar(): React.JSX.Element {
  const user = { initials: 'JF', name: 'Juan' }
  const filesView = useFileTree((s) => s.open)
  const treeWidth = useFileTree((s) => s.width)
  const [resizing, setResizing] = useState(false)
  const setView = (files: boolean): void => {
    fileTreeStore.getState().setPrefs({ open: files })
    void hydra.setFileTree({ open: files })
  }
  const onResizeStart = (e: React.MouseEvent): void => {
    e.preventDefault()
    setResizing(true)
    const startX = e.clientX
    const startW = treeWidth
    const move = (ev: MouseEvent): void => {
      fileTreeStore
        .getState()
        .setPrefs({ width: Math.max(FILE_TREE_MIN_WIDTH, startW + (ev.clientX - startX)) })
    }
    const up = (): void => {
      setResizing(false)
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      void hydra.setFileTree({ width: fileTreeStore.getState().width })
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }
  return (
    <aside
      className={styles.sidebar}
      style={{ width: filesView ? treeWidth : SIDEBAR_DEFAULT_W }}
      data-testid="sidebar"
      data-view={filesView ? 'files' : 'sessions'}
    >
      <div className={styles.tabs} data-testid="sidebar-tabs">
        <button
          className={`${styles.tab} ${!filesView ? styles.tabActive : ''}`}
          onClick={() => setView(false)}
          title="Sesiones"
          aria-pressed={!filesView}
          data-testid="tab-sessions"
        >
          ▣
        </button>
        <button
          className={`${styles.tab} ${filesView ? styles.tabActive : ''}`}
          onClick={() => setView(true)}
          title="Archivos del proyecto (⌘⇧E)"
          aria-pressed={filesView}
          data-testid="tab-files"
        >
          ▤
        </button>
      </div>
      {filesView && (
        <div
          className={`${styles.resizer} ${resizing ? styles.resizerActive : ''}`}
          onMouseDown={onResizeStart}
          data-testid="sidebar-resizer"
        />
      )}
      <div className={styles.brand} data-testid="brand">
        <img className={styles.brandLogo} src={badge} alt="" />
        <img className={styles.brandWordmark} src={wordmark} alt="Hydra AI" />
      </div>
      {filesView ? (
        <ErrorBoundary label="el árbol de archivos">
          <FileTreePanel />
        </ErrorBoundary>
      ) : (
        <>
          <nav className={styles.nav} aria-label="Secciones">
            {NAV.map((n) => (
              <button
                key={n.key}
                className={`${styles.navBtn} ${n.key === 'sessions' ? styles.navBtnActive : ''}`}
                disabled={!n.enabled}
                title={n.enabled ? n.label : `${n.label} — próximamente`}
              >
                {n.label}
              </button>
            ))}
          </nav>
          <div className={styles.divider} />
          <ProjectList />
        </>
      )}
      <div className={styles.user} data-testid="user-block">
        <span className={styles.avatar}>{user.initials}</span>
        <span>{user.name}</span>
      </div>
    </aside>
  )
}
