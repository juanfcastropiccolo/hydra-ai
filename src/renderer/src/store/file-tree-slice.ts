// Feature 002: file tree state. Kept as a separate vanilla store so it can be tested without React
// and so the 001 app-store stays untouched. Follows the same invariants: selectors return primitives
// or stable references.
import { createStore, useStore, type StoreApi } from 'zustand'
import type { FsEntry, GitStatus, GitStatusResult } from '@shared/types'

export const HIGHLIGHT_MS = 2000

export interface FileTreeState {
  open: boolean
  width: number
  /** Sidebar collapsed to a rail (⌘B). */
  collapsed: boolean
  /** Project whose tree is shown (derived from focus; see setProjectFromFocus). */
  projectId: string | null
  /** Root path of the shown project (absolute). */
  root: string | null
  /** absDir → entries (lazy cache). */
  nodes: Record<string, FsEntry[]>
  /** projectId → expanded absolute dirs. */
  expandedByProject: Record<string, string[]>
  selectedPath: string | null
  filter: string
  /** Relative paths (from listRecursive) matching the filter, or null when no filter. */
  filterMatches: string[] | null
  git: GitStatusResult
  /** absPath → expiry timestamp (ms). */
  highlights: Record<string, number>
  loadingDirs: string[]
  error: string | null

  setPrefs(p: { open?: boolean; width?: number; collapsed?: boolean }): void
  toggleOpen(): void
  toggleCollapsed(): void
  /** Called whenever focus changes. Only switches project when the new focused project differs. */
  setProjectFromFocus(projectId: string | null, root: string | null): void
  setNodes(dir: string, entries: FsEntry[], now?: number): void
  setLoading(dir: string, loading: boolean): void
  expand(dir: string): void
  collapse(dir: string): void
  toggleDir(dir: string): void
  collapseAll(): void
  isExpanded(dir: string): boolean
  select(path: string | null): void
  setFilter(filter: string): void
  setFilterMatches(m: string[] | null): void
  setGit(git: GitStatusResult): void
  /** Dirs to re-list after an fs.changed event: expanded dirs (+ root) among `dirs`, or all expanded when `all`. */
  dirsToRefresh(ev: { root: string; dirs: string[]; all: boolean }): string[]
  pruneHighlights(now?: number): void
  setError(e: string | null): void
}

export function createFileTreeStore(): StoreApi<FileTreeState> {
  return createStore<FileTreeState>((set, get) => ({
    open: false,
    width: 300,
    collapsed: false,
    projectId: null,
    root: null,
    nodes: {},
    expandedByProject: {},
    selectedPath: null,
    filter: '',
    filterMatches: null,
    git: { root: null, statuses: {} },
    highlights: {},
    loadingDirs: [],
    error: null,

    setPrefs: (p) =>
      set((s) => ({
        open: p.open ?? s.open,
        width: p.width ?? s.width,
        collapsed: p.collapsed ?? s.collapsed
      })),
    toggleOpen: () => set((s) => ({ open: !s.open })),
    toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
    setProjectFromFocus: (projectId, root) => {
      if (projectId === null) return // losing focus keeps the last project (FR-2)
      if (projectId === get().projectId) return
      set({
        projectId,
        root,
        nodes: {},
        selectedPath: null,
        filter: '',
        filterMatches: null,
        git: { root: null, statuses: {} },
        highlights: {},
        error: null
      })
    },
    setNodes: (dir, entries, now = Date.now()) =>
      set((s) => {
        const prev = s.nodes[dir]
        const highlights = { ...s.highlights }
        if (prev) {
          const known = new Set(prev.map((e) => e.name))
          for (const e of entries)
            if (!known.has(e.name)) highlights[`${dir}/${e.name}`] = now + HIGHLIGHT_MS
        }
        return { nodes: { ...s.nodes, [dir]: entries }, highlights }
      }),
    setLoading: (dir, loading) =>
      set((s) => ({
        loadingDirs: loading
          ? s.loadingDirs.includes(dir)
            ? s.loadingDirs
            : [...s.loadingDirs, dir]
          : s.loadingDirs.filter((d) => d !== dir)
      })),
    expand: (dir) =>
      set((s) => {
        if (!s.projectId) return {}
        const cur = s.expandedByProject[s.projectId] ?? []
        if (cur.includes(dir)) return {}
        return { expandedByProject: { ...s.expandedByProject, [s.projectId]: [...cur, dir] } }
      }),
    collapse: (dir) =>
      set((s) => {
        if (!s.projectId) return {}
        const cur = s.expandedByProject[s.projectId] ?? []
        // collapsing a dir also collapses its descendants
        return {
          expandedByProject: {
            ...s.expandedByProject,
            [s.projectId]: cur.filter((d) => d !== dir && !d.startsWith(dir + '/'))
          }
        }
      }),
    toggleDir: (dir) => (get().isExpanded(dir) ? get().collapse(dir) : get().expand(dir)),
    collapseAll: () =>
      set((s) =>
        s.projectId ? { expandedByProject: { ...s.expandedByProject, [s.projectId]: [] } } : {}
      ),
    isExpanded: (dir) => {
      const s = get()
      return s.projectId ? (s.expandedByProject[s.projectId] ?? []).includes(dir) : false
    },
    select: (selectedPath) => set({ selectedPath }),
    setFilter: (filter) => set({ filter, filterMatches: filter ? get().filterMatches : null }),
    setFilterMatches: (filterMatches) => set({ filterMatches }),
    setGit: (git) => set({ git }),
    dirsToRefresh: (ev) => {
      const s = get()
      if (!s.root || ev.root !== s.root) return []
      const expanded = new Set([
        s.root,
        ...(s.projectId ? (s.expandedByProject[s.projectId] ?? []) : [])
      ])
      if (ev.all) return [...expanded]
      return ev.dirs.filter((d) => expanded.has(d))
    },
    pruneHighlights: (now = Date.now()) =>
      set((s) => {
        const next: Record<string, number> = {}
        for (const [k, v] of Object.entries(s.highlights)) if (v > now) next[k] = v
        return Object.keys(next).length === Object.keys(s.highlights).length
          ? {}
          : { highlights: next }
      }),
    setError: (error) => set({ error })
  }))
}

export const fileTreeStore = createFileTreeStore()
export function useFileTree<T>(selector: (s: FileTreeState) => T): T {
  return useStore(fileTreeStore, selector)
}

/** Pure: git status for a relative path, considering ancestors for 'ignored'. */
export function statusForPath(
  rel: string,
  isDir: boolean,
  statuses: Record<string, GitStatus>
): GitStatus | null {
  const direct = statuses[rel] ?? (isDir ? statuses[rel + '/'] : undefined)
  if (direct) return direct
  const parts = rel.split('/')
  for (let i = 1; i < parts.length; i++)
    if (statuses[parts.slice(0, i).join('/') + '/'] === 'ignored') return 'ignored'
  if (isDir) {
    const prefix = rel + '/'
    const rank: Record<GitStatus, number> = {
      conflict: 6,
      deleted: 5,
      modified: 4,
      renamed: 3,
      added: 2,
      untracked: 1,
      ignored: 0
    }
    let best: GitStatus | null = null
    for (const [p, s] of Object.entries(statuses)) {
      if (!p.startsWith(prefix) || s === 'ignored') continue
      if (best === null || rank[s] > rank[best]) best = s
    }
    return best
  }
  return null
}
