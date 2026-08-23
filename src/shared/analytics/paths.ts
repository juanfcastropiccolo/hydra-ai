// Feature 005: map a session cwd to a project key/label. Pure (no node:path) so both processes share it.
import type { Project } from '../types'

const norm = (p: string): string => {
  const t = p.replace(/\/+$/, '')
  return (t === '' ? '/' : t).replace(/^\/private(\/|$)/, '/')
}

/** `~/Documents/Personal/foo` → `…/Personal/foo`; keeps the last `keep` segments. */
export function shortenPath(cwd: string, home?: string, keep = 2): string {
  let p = cwd.replace(/\/+$/, '')
  if (home && (p === home || p.startsWith(home + '/'))) p = '~' + p.slice(home.length)
  const parts = p.split('/').filter(Boolean)
  if (parts.length <= keep) return p || '/'
  return '…/' + parts.slice(-keep).join('/')
}

export interface ProjectKey {
  /** Stable grouping key: the project id for registered projects, else the normalised cwd. */
  key: string
  label: string
  projectId: string | null
}

/** Deepest registered project whose path is a prefix of `cwd` (same rule as the sidebar, 001). */
export function projectKeyFor(
  cwd: string,
  projects: Pick<Project, 'id' | 'name' | 'path'>[],
  home?: string
): ProjectKey {
  const c = norm(cwd)
  let best: { id: string; name: string; len: number } | null = null
  for (const p of projects) {
    const pp = norm(p.path)
    if (c === pp || c.startsWith(pp + '/')) {
      if (!best || pp.length > best.len) best = { id: p.id, name: p.name, len: pp.length }
    }
  }
  if (best) return { key: best.id, label: best.name, projectId: best.id }
  return { key: c, label: shortenPath(c, home), projectId: null }
}
