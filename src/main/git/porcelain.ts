// Pure parser for `git status --porcelain=v1 -z --untracked-files=all --ignored=matching`.
// Format per entry: "XY path\0" (renames/copies: "XY new\0old\0"). No escaping thanks to -z.
import type { GitStatus } from '@shared/types'

export function statusFromCodes(x: string, y: string): GitStatus | null {
  if (x === '?' && y === '?') return 'untracked'
  if (x === '!' && y === '!') return 'ignored'
  if (x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D'))
    return 'conflict'
  if (x === 'D' || y === 'D') return 'deleted'
  if (x === 'R' || y === 'R' || x === 'C' || y === 'C') return 'renamed'
  if (x === 'A' || y === 'A') return 'added'
  if (x === 'M' || y === 'M' || x === 'T' || y === 'T') return 'modified'
  return null
}

/** Parse raw porcelain (-z) output into relPath → status. Rename: new path gets 'renamed', old path 'deleted'. */
export function parseGitPorcelain(raw: string | Buffer): Record<string, GitStatus> {
  const text = typeof raw === 'string' ? raw : raw.toString('utf8')
  const out: Record<string, GitStatus> = {}
  const fields = text.split('\0')
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i]
    if (!f || f.length < 4) continue
    const x = f[0] ?? ' '
    const y = f[1] ?? ' '
    const path = f.slice(3)
    const status = statusFromCodes(x, y)
    if (!status) continue
    out[path] = status
    if (x === 'R' || x === 'C' || y === 'R' || y === 'C') {
      const old = fields[i + 1]
      if (old) {
        if (x === 'R' || y === 'R') out[old] = 'deleted'
        i++
      }
    }
  }
  return out
}

/** Status to show on a directory: the "most important" status among its descendants, or null. */
export function folderStatus(
  dirRel: string,
  statuses: Record<string, GitStatus>
): GitStatus | null {
  const prefix = dirRel === '' ? '' : dirRel.endsWith('/') ? dirRel : dirRel + '/'
  let best: GitStatus | null = null
  const rank: Record<GitStatus, number> = {
    conflict: 6,
    deleted: 5,
    modified: 4,
    renamed: 3,
    added: 2,
    untracked: 1,
    ignored: 0
  }
  for (const [p, s] of Object.entries(statuses)) {
    if (prefix === '' ? true : p.startsWith(prefix)) {
      if (s === 'ignored' && p !== prefix) continue // ignored children don't decorate parents
      if (best === null || rank[s] > rank[best]) best = s
    }
  }
  return best
}

/** A path is ignored if it or any ancestor directory is listed as ignored. */
export function isIgnored(rel: string, statuses: Record<string, GitStatus>): boolean {
  if (statuses[rel] === 'ignored' || statuses[rel + '/'] === 'ignored') return true
  const parts = rel.split('/')
  for (let i = 1; i < parts.length; i++) {
    if (statuses[parts.slice(0, i).join('/') + '/'] === 'ignored') return true
  }
  return false
}
