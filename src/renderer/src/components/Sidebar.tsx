import styles from './Sidebar.module.css'
import badge from '../assets/brand/hydra-badge.png'
import wordmark from '../assets/brand/hydra-wordmark-dark.png'
import { useState } from 'react'
import { FILE_TREE_MIN_WIDTH } from '@shared/types'
import { hydra } from '../lib/hydra-client'
import { useAppStore } from '../store/app-store'
import { fileTreeStore, useFileTree } from '../store/file-tree-slice'
import { ErrorBoundary } from './ErrorBoundary'
import { FileTreePanel } from './file-tree/FileTreePanel'
import { ProjectList } from './ProjectList'

const NAV = [
  { key: 'sessions', label: 'Sessions', enabled: true },
  { key: 'analytics', label: 'Analytics', enabled: true },
  { key: 'graph', label: 'Graph Know', enabled: true },
  { key: 'config', label: 'Config', enabled: true }
] as const

export function Sidebar(): React.JSX.Element {
  const user = { initials: 'JF', name: 'Juan' }
  const filesView = useFileTree((s) => s.open)
  const treeWidth = useFileTree((s) => s.width)
  const collapsed = useFileTree((s) => s.collapsed)
  const [resizing, setResizing] = useState(false)
  // Feature 005: which view fills the central area
  const centerView = useAppStore((s) => s.centerView)
  const setCenterView = useAppStore((s) => s.setCenterView)
  const goTo = (view: 'sessions' | 'analytics' | 'graph' | 'config'): void => {
    setCenterView(view)
    void hydra.setCenterView(view)
  }
  const setView = (files: boolean): void => {
    fileTreeStore.getState().setPrefs({ open: files, collapsed: false })
    void hydra.setFileTree({ open: files, collapsed: false })
  }
  const setCollapsed = (c: boolean): void => {
    fileTreeStore.getState().setPrefs({ collapsed: c })
    void hydra.setFileTree({ collapsed: c })
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
  if (collapsed) {
    return (
      <aside
        className={`${styles.sidebar} ${styles.rail}`}
        data-testid="sidebar"
        data-view={filesView ? 'files' : 'sessions'}
        data-collapsed="true"
      >
        <button
          className={styles.railBtn}
          onClick={() => setCollapsed(false)}
          title="Expandir barra (⌘B)"
          data-testid="sidebar-expand"
        >
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 3l5 5-5 5" />
          </svg>
        </button>
        <img className={styles.railLogo} src={badge} alt="Hydra AI" />
        <button
          className={`${styles.tab} ${!filesView ? styles.tabActive : ''}`}
          onClick={() => setView(false)}
          title="Sesiones"
          data-testid="tab-sessions"
        >
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="1.5" y="2" width="13" height="12" rx="2" />
            <path d="M8 2v12M1.5 8h13" />
          </svg>
        </button>
        <button
          className={`${styles.tab} ${filesView ? styles.tabActive : ''}`}
          onClick={() => setView(true)}
          title="Archivos (⌘⇧E)"
          data-testid="tab-files"
        >
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M1.5 4.5A1.5 1.5 0 0 1 3 3h3.2l1.4 1.5H13A1.5 1.5 0 0 1 14.5 6v6A1.5 1.5 0 0 1 13 13.5H3A1.5 1.5 0 0 1 1.5 12z" />
            <path d="M5 9.5h6M5 11.5h4" opacity="0.7" />
          </svg>
        </button>
        <div className={styles.railSpacer} />
        <span className={styles.railAvatar} title={user.name}>
          {user.initials}
        </span>
      </aside>
    )
  }

  return (
    <aside
      className={styles.sidebar}
      style={{ width: treeWidth }}
      data-testid="sidebar"
      data-view={filesView ? 'files' : 'sessions'}
      data-collapsed="false"
    >
      <div className={styles.tabs} data-testid="sidebar-tabs">
        <button
          className={`${styles.tab} ${!filesView ? styles.tabActive : ''}`}
          onClick={() => setView(false)}
          title="Sesiones"
          aria-pressed={!filesView}
          data-testid="tab-sessions"
        >
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="1.5" y="2" width="13" height="12" rx="2" />
            <path d="M8 2v12M1.5 8h13" />
          </svg>
        </button>
        <button
          className={`${styles.tab} ${filesView ? styles.tabActive : ''}`}
          onClick={() => setView(true)}
          title="Archivos del proyecto (⌘⇧E)"
          aria-pressed={filesView}
          data-testid="tab-files"
        >
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M1.5 4.5A1.5 1.5 0 0 1 3 3h3.2l1.4 1.5H13A1.5 1.5 0 0 1 14.5 6v6A1.5 1.5 0 0 1 13 13.5H3A1.5 1.5 0 0 1 1.5 12z" />
            <path d="M5 9.5h6M5 11.5h4" opacity="0.7" />
          </svg>
        </button>
      </div>
      <div
        className={`${styles.resizer} ${resizing ? styles.resizerActive : ''}`}
        onMouseDown={onResizeStart}
        data-testid="sidebar-resizer"
      />
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
                className={`${styles.navBtn} ${n.key === centerView ? styles.navBtnActive : ''}`}
                disabled={!n.enabled}
                title={n.enabled ? n.label : `${n.label} — próximamente`}
                onClick={() =>
                  n.enabled && goTo(n.key as 'sessions' | 'analytics' | 'graph' | 'config')
                }
                data-testid={`nav-${n.key}`}
                aria-current={n.key === centerView ? 'page' : undefined}
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
        <span className={styles.userName}>{user.name}</span>
        <button
          className={styles.collapseBtn}
          onClick={() => setCollapsed(true)}
          title="Colapsar barra (⌘B)"
          data-testid="sidebar-collapse"
        >
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10 3L5 8l5 5" />
          </svg>
        </button>
      </div>
    </aside>
  )
}
