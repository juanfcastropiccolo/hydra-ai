// Wires IPC (fs/git/watch) to the file-tree store. Mounted once by FileTreePanel.
import { useEffect } from 'react'
import { hydra } from '../../lib/hydra-client'
import { appStore } from '../../store/app-store'
import { fileTreeStore } from '../../store/file-tree-slice'

export async function loadDir(dir: string): Promise<void> {
  const st = fileTreeStore.getState()
  st.setLoading(dir, true)
  try {
    const entries = await hydra.fsList(dir)
    fileTreeStore.getState().setNodes(dir, entries)
    fileTreeStore.getState().setError(null)
  } catch (e) {
    fileTreeStore.getState().setError((e as Error).message)
  } finally {
    fileTreeStore.getState().setLoading(dir, false)
  }
}

export async function refreshGit(root: string): Promise<void> {
  try {
    const r = await hydra.gitStatus(root)
    if (fileTreeStore.getState().root === root) fileTreeStore.getState().setGit(r)
  } catch {
    /* no git decorations */
  }
}

/** Derive the project the tree should show from the (last) focused pane. */
function projectFromFocus(): { projectId: string | null; root: string | null } {
  const app = appStore.getState()
  const sid = app.focusedSessionId ?? app.lastFocusedSessionId
  const session = sid ? app.sessions.find((s) => s.sessionId === sid) : undefined
  const projectId = session?.projectId ?? app.projects[0]?.id ?? null
  const project = app.projects.find((p) => p.id === projectId)
  return { projectId: project?.id ?? null, root: project?.path ?? null }
}

export function useFileTreeData(): void {
  // 1) follow focus / projects
  useEffect(() => {
    const apply = (): void => {
      const { projectId, root } = projectFromFocus()
      fileTreeStore.getState().setProjectFromFocus(projectId, root)
    }
    apply()
    return appStore.subscribe(apply)
  }, [])

  // 2) when root changes: list root, git status, watch; unwatch previous
  useEffect(() => {
    let prevRoot: string | null = null
    const run = (root: string | null): void => {
      if (root === prevRoot) return
      if (prevRoot) void hydra.fsUnwatch(prevRoot)
      prevRoot = root
      if (!root) return
      void loadDir(root)
      void refreshGit(root)
      void hydra.fsWatch(root)
      // re-list dirs that were expanded in a previous visit of this project
      const st = fileTreeStore.getState()
      for (const d of st.projectId ? (st.expandedByProject[st.projectId] ?? []) : [])
        void loadDir(d)
    }
    run(fileTreeStore.getState().root)
    const unsub = fileTreeStore.subscribe((s, prev) => {
      if (s.root !== prev.root) run(s.root)
    })
    return () => {
      unsub()
      if (prevRoot) void hydra.fsUnwatch(prevRoot)
    }
  }, [])

  // 3) fs/git push events
  useEffect(() => {
    const offFs = hydra.onFsChanged((ev) => {
      const dirs = fileTreeStore.getState().dirsToRefresh(ev)
      for (const d of dirs) void loadDir(d)
    })
    const offGit = hydra.onGitChanged((ev) => {
      if (fileTreeStore.getState().root === ev.root) fileTreeStore.getState().setGit(ev.result)
    })
    const timer = setInterval(() => fileTreeStore.getState().pruneHighlights(), 500)
    return () => {
      offFs()
      offGit()
      clearInterval(timer)
    }
  }, [])
}
