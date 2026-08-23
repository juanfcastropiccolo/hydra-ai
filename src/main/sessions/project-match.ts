// Pure: assign a session cwd to the most specific registered project (by realpath prefix).
import { sep } from 'node:path'
import type { Project } from '@shared/types'

export interface ProjectPathIndex {
  /** project id → normalised (realpath, no trailing slash) path */
  byId: Map<string, string>
}

export function normalisePath(p: string): string {
  const trimmed = p.replace(/[\\/]+$/, '')
  return trimmed === '' ? sep : trimmed
}

export function buildProjectIndex(
  projects: Project[],
  realpath: (p: string) => string
): ProjectPathIndex {
  const byId = new Map<string, string>()
  for (const p of projects) {
    let rp = p.path
    try {
      rp = realpath(p.path)
    } catch {
      /* missing folder: keep declared path so matching still works if it reappears */
    }
    byId.set(p.id, normalisePath(rp))
  }
  return { byId }
}

/** Returns the id of the deepest project whose path is a prefix of cwd, or null. */
export function matchProject(
  cwd: string,
  index: ProjectPathIndex,
  realpath: (p: string) => string
): string | null {
  let c = cwd
  try {
    c = realpath(cwd)
  } catch {
    /* cwd may have been deleted; match on the declared string */
  }
  c = normalisePath(c)
  let best: { id: string; len: number } | null = null
  for (const [id, root] of index.byId) {
    const isMatch = c === root || c.startsWith(root.endsWith(sep) ? root : root + sep)
    if (isMatch && (!best || root.length > best.len)) best = { id, len: root.length }
  }
  return best?.id ?? null
}
