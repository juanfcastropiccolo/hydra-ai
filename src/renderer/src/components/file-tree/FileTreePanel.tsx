import { useCallback, useEffect, useMemo, useRef } from 'react'
import { hydra } from '../../lib/hydra-client'
import { focusTerminalIn } from '../../lib/terminal-dom'
import { appStore, useAppStore } from '../../store/app-store'
import { fileTreeStore, statusForPath, useFileTree } from '../../store/file-tree-slice'
import styles from './FileTreePanel.module.css'
import { TreeNode } from './TreeNode'
import { flattenTree, type TreeRow } from './tree-rows'
import { loadDir, useFileTreeData } from './use-file-tree-data'

export const HYDRA_PATH_MIME = 'application/x-hydra-path'

export function FileTreePanel(): React.JSX.Element {
  useFileTreeData()
  const projectId = useFileTree((s) => s.projectId)
  const root = useFileTree((s) => s.root)
  const nodes = useFileTree((s) => s.nodes)
  const expandedByProject = useFileTree((s) => s.expandedByProject)
  const selectedPath = useFileTree((s) => s.selectedPath)
  const filter = useFileTree((s) => s.filter)
  const filterMatches = useFileTree((s) => s.filterMatches)
  const git = useFileTree((s) => s.git)
  const highlights = useFileTree((s) => s.highlights)
  const loadingDirs = useFileTree((s) => s.loadingDirs)
  const error = useFileTree((s) => s.error)
  const project = useAppStore((s) => s.projects.find((p) => p.id === projectId))
  const bodyRef = useRef<HTMLDivElement>(null)
  const filterRef = useRef<HTMLInputElement>(null)

  const expandedList = projectId ? expandedByProject[projectId] : undefined
  const expandedSet = useMemo(() => new Set(expandedList ?? []), [expandedList])
  const matchSet = useMemo(() => (filterMatches ? new Set(filterMatches) : null), [filterMatches])
  const rows = useMemo(
    () =>
      root
        ? flattenTree({
            root,
            nodes,
            isExpanded: (d) => expandedSet.has(d),
            filterMatches: matchSet
          })
        : [],
    [root, nodes, expandedSet, matchSet]
  )

  // ---- actions ----
  const reveal = useCallback((absPath: string) => {
    const st = fileTreeStore.getState()
    if (!st.root) return
    const rel = absPath.slice(st.root.length + 1)
    const parts = rel.split('/')
    let dir = st.root
    for (let i = 0; i < parts.length - 1; i++) {
      dir = `${dir}/${parts[i]}`
      st.expand(dir)
      if (!st.nodes[dir]) void loadDir(dir)
    }
    st.setFilter('')
    st.select(absPath)
  }, [])
  const toggle = useCallback(
    (row: TreeRow) => {
      const st = fileTreeStore.getState()
      if (st.filter) {
        // filter mode: a dir row "opens" by revealing it in the real tree
        st.setFilter('')
        reveal(row.path)
        st.expand(row.path)
        if (!st.nodes[row.path]) void loadDir(row.path)
        return
      }
      if (st.isExpanded(row.path)) st.collapse(row.path)
      else {
        st.expand(row.path)
        if (!st.nodes[row.path]) void loadDir(row.path)
      }
    },
    [reveal]
  )
  const open = useCallback((row: TreeRow) => void hydra.fsOpen(row.path), [])
  const contextMenu = useCallback(
    (row: TreeRow, e: React.MouseEvent) => {
      e.preventDefault()
      if (!root || !projectId) return
      fileTreeStore.getState().select(row.path)
      void hydra.fsContextMenu({ path: row.path, root, projectId, isDir: row.isDir })
    },
    [root, projectId]
  )
  const dragStart = useCallback((row: TreeRow, e: React.DragEvent) => {
    e.dataTransfer.setData(HYDRA_PATH_MIME, row.path)
    e.dataTransfer.setData('text/plain', row.rel)
    e.dataTransfer.effectAllowed = 'copy'
  }, [])
  const backToTerminal = useCallback(() => {
    const sid = appStore.getState().lastFocusedSessionId
    if (!sid) return
    focusTerminalIn(
      document.querySelector<HTMLElement>(
        `[data-testid=pane][data-session-id="${CSS.escape(sid)}"]`
      )
    )
  }, [])

  // ---- filter → recursive listing ----
  useEffect(() => {
    if (!root) return
    if (!filter) return
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const all = await hydra.fsListRecursive(root, 10_000)
        if (cancelled) return
        const q = filter.toLowerCase()
        fileTreeStore
          .getState()
          .setFilterMatches(
            all.filter((p) => p.split('/').filter(Boolean).pop()!.toLowerCase().includes(q))
          )
      } catch {
        /* ignore */
      }
    }, 120)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [filter, root])

  // ---- keyboard ----
  const onKeyDown = (e: React.KeyboardEvent): void => {
    const st = fileTreeStore.getState()
    const idx = rows.findIndex((r) => r.path === selectedPath)
    const sel = (i: number): void => {
      const r = rows[Math.max(0, Math.min(rows.length - 1, i))]
      if (r) {
        st.select(r.path)
        bodyRef.current
          ?.querySelector<HTMLElement>(`[data-path="${CSS.escape(r.path)}"]`)
          ?.scrollIntoView({ block: 'nearest' })
      }
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        sel(idx + 1)
        break
      case 'ArrowUp':
        e.preventDefault()
        sel(idx - 1)
        break
      case 'ArrowRight': {
        e.preventDefault()
        const r = rows[idx]
        if (r?.isDir && !r.expanded) toggle(r)
        else sel(idx + 1)
        break
      }
      case 'ArrowLeft': {
        e.preventDefault()
        const r = rows[idx]
        if (r?.isDir && r.expanded) toggle(r)
        else if (r) {
          const parent = r.path.slice(0, r.path.lastIndexOf('/'))
          const pi = rows.findIndex((x) => x.path === parent)
          if (pi >= 0) sel(pi)
        }
        break
      }
      case 'Enter': {
        const r = rows[idx]
        if (r) r.isDir ? toggle(r) : open(r)
        break
      }
      case 'Escape':
        e.preventDefault()
        e.stopPropagation()
        backToTerminal()
        break
      case 'f':
        if (e.metaKey) {
          e.preventDefault()
          filterRef.current?.focus()
        }
        break
    }
  }

  const gitRoot = git.root
  const relToGit = (absPath: string): string | null =>
    gitRoot && absPath.startsWith(gitRoot + '/') ? absPath.slice(gitRoot.length + 1) : null

  return (
    <section className={styles.panel} data-testid="file-tree" data-project-id={projectId ?? ''}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <span className={styles.title} data-testid="file-tree-title">
            {project?.name ?? 'Archivos'}
          </span>
          <button
            className={styles.iconBtn}
            title="Colapsar todo"
            onClick={() => fileTreeStore.getState().collapseAll()}
            data-testid="file-tree-collapse-all"
          >
            ⊟
          </button>
        </div>
        {project && (
          <div className={styles.path} title={project.path} data-testid="file-tree-path">
            {project.path}
          </div>
        )}
        <input
          ref={filterRef}
          className={styles.filter}
          placeholder="Filtrar por nombre… (⌘F)"
          value={filter}
          onChange={(e) => fileTreeStore.getState().setFilter(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              fileTreeStore.getState().setFilter('')
              bodyRef.current?.focus()
            }
          }}
          data-testid="file-tree-filter"
        />
      </div>
      <div
        className={styles.body}
        ref={bodyRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        role="tree"
        data-testid="file-tree-body"
      >
        {!project && (
          <div className={styles.empty}>
            Agregá un proyecto o enfocá un pane para ver sus archivos.
          </div>
        )}
        {project?.missing && (
          <div className={styles.error}>⚠ La carpeta del proyecto no existe: {project.path}</div>
        )}
        {error && <div className={styles.error}>⚠ {error}</div>}
        {project && !project.missing && rows.length === 0 && !error && (
          <div className={styles.empty}>{filter ? 'Sin coincidencias.' : 'Carpeta vacía.'}</div>
        )}
        {rows.map((r) => {
          const rel = relToGit(r.path)
          const status = rel !== null ? statusForPath(rel, r.isDir, git.statuses) : null
          return (
            <TreeNode
              key={r.path}
              row={r}
              status={status}
              selected={r.path === selectedPath}
              highlighted={highlights[r.path] !== undefined}
              loading={loadingDirs.includes(r.path)}
              onToggle={toggle}
              onSelect={(row) => fileTreeStore.getState().select(row.path)}
              onOpen={open}
              onContextMenu={contextMenu}
              onDragStart={dragStart}
            />
          )
        })}
        {filter && (
          <div className={styles.hint}>
            Buscando en carpetas no ignoradas (máx. 10 000 entradas).
          </div>
        )}
      </div>
    </section>
  )
}
