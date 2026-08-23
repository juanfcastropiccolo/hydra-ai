// Pure: flatten the visible tree into rows for rendering + keyboard navigation.
import type { FsEntry } from '@shared/types'

export interface TreeRow {
  path: string
  rel: string
  name: string
  depth: number
  entry: FsEntry
  isDir: boolean
  expanded: boolean
}

export function flattenTree(opts: {
  root: string
  nodes: Record<string, FsEntry[]>
  isExpanded: (dir: string) => boolean
  /** When set (filter mode), rows are the matches themselves as a flat list, labelled by relative path. */
  filterMatches: Set<string> | null
}): TreeRow[] {
  const rows: TreeRow[] = []
  if (opts.filterMatches) {
    for (const m of opts.filterMatches) {
      const isDir = m.endsWith('/')
      const rel = isDir ? m.slice(0, -1) : m
      const name = rel.split('/').pop() ?? rel
      rows.push({
        path: `${opts.root}/${rel}`,
        rel,
        name: rel,
        depth: 0,
        entry: { name, kind: isDir ? 'dir' : 'file' },
        isDir,
        expanded: false
      })
    }
    return rows
  }
  const visit = (dir: string, depth: number): void => {
    const entries = opts.nodes[dir]
    if (!entries) return
    for (const e of entries) {
      const path = `${dir}/${e.name}`
      const rel = path.slice(opts.root.length + 1)
      const isDir = e.kind === 'dir' || (e.kind === 'symlink' && e.symlinkKind === 'dir')
      if (opts.filterMatches) {
        const keep = [...opts.filterMatches].some(
          (m) => m === rel || m === rel + '/' || m.startsWith(rel + '/')
        )
        if (!keep) continue
        const expanded = isDir
        rows.push({ path, rel, name: e.name, depth, entry: e, isDir, expanded })
        if (isDir) visit(path, depth + 1)
        continue
      }
      const expanded = isDir && opts.isExpanded(path)
      rows.push({ path, rel, name: e.name, depth, entry: e, isDir, expanded })
      if (expanded) visit(path, depth + 1)
    }
  }
  visit(opts.root, 0)
  return rows
}
