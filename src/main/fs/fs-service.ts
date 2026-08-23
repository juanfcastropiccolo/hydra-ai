// FsService: lazy directory listing + one recursive watcher per root (feature 002).
import { EventEmitter } from 'node:events'
import { watch, type FSWatcher } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import type { FsEntry } from '@shared/types'

export const WATCH_DEBOUNCE_MS = 300
const HIDDEN_DIRS = new Set(['.git'])
const RECURSIVE_SKIP = new Set(['.git', 'node_modules'])

/** Pure: folders first, then files, case-insensitive, stable. */
export function sortEntries(entries: FsEntry[]): FsEntry[] {
  const isDirLike = (e: FsEntry): boolean =>
    e.kind === 'dir' || (e.kind === 'symlink' && e.symlinkKind === 'dir')
  return [...entries].sort((a, b) => {
    const da = isDirLike(a) ? 0 : 1
    const db = isDirLike(b) ? 0 : 1
    if (da !== db) return da - db
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })
  })
}

export interface WatchEvent {
  root: string
  /** Absolute dirs whose listing may have changed. Empty when `all` is true. */
  dirs: string[]
  /** True when we could not attribute events to dirs (re-list everything expanded). */
  all: boolean
}

/** Pure: collapse a burst of raw fs.watch events into one WatchEvent. */
export function coalesceWatchEvents(root: string, raw: Array<string | null>): WatchEvent {
  const dirs = new Set<string>()
  let all = false
  for (const filename of raw) {
    if (filename === null || filename === '') {
      all = true
      continue
    }
    const abs = join(root, filename)
    // The changed *listing* is the parent dir; a rename/creation of a dir also affects the dir itself.
    dirs.add(dirname(abs))
  }
  if (all) return { root, dirs: [], all: true }
  return { root, dirs: [...dirs], all: false }
}

export interface FsServiceEvents {
  changed: [WatchEvent]
  watchError: [{ root: string; error: string }]
}

export class FsService extends EventEmitter<FsServiceEvents> {
  private watchers = new Map<
    string,
    {
      watcher: FSWatcher
      pending: Array<string | null>
      timer: ReturnType<typeof setTimeout> | null
    }
  >()

  constructor(private readonly debounceMs = WATCH_DEBOUNCE_MS) {
    super()
  }

  /** List one directory (non-recursive). Hides `.git`. Never throws for unreadable children. */
  async list(dir: string): Promise<FsEntry[]> {
    const dirents = await readdir(dir, { withFileTypes: true })
    const out: FsEntry[] = []
    for (const d of dirents) {
      if (HIDDEN_DIRS.has(d.name)) continue
      if (d.isSymbolicLink()) {
        let symlinkKind: FsEntry['symlinkKind']
        try {
          const st = await stat(join(dir, d.name))
          symlinkKind = st.isDirectory() ? 'dir' : 'file'
        } catch {
          /* dangling */
        }
        out.push({ name: d.name, kind: 'symlink', ...(symlinkKind ? { symlinkKind } : {}) })
      } else if (d.isDirectory()) out.push({ name: d.name, kind: 'dir' })
      else if (d.isFile()) out.push({ name: d.name, kind: 'file' })
      else out.push({ name: d.name, kind: 'other' })
    }
    return sortEntries(out)
  }

  /**
   * Bounded recursive listing of relative paths for the quick filter.
   * Skips .git, node_modules, and any dir in `skipDirs` (e.g. git-ignored). Does not follow symlinks.
   */
  async listRecursive(
    root: string,
    opts: { limit?: number; skipDirs?: Set<string> } = {}
  ): Promise<string[]> {
    const limit = opts.limit ?? 10_000
    const out: string[] = []
    const queue: string[] = [root]
    while (queue.length && out.length < limit) {
      const dir = queue.shift()!
      let dirents
      try {
        dirents = await readdir(dir, { withFileTypes: true })
      } catch {
        continue
      }
      for (const d of dirents) {
        if (out.length >= limit) break
        const abs = join(dir, d.name)
        const rel = relative(root, abs).split(sep).join('/')
        if (d.isDirectory()) {
          if (
            RECURSIVE_SKIP.has(d.name) ||
            opts.skipDirs?.has(rel) ||
            opts.skipDirs?.has(rel + '/')
          )
            continue
          out.push(rel + '/')
          queue.push(abs)
        } else if (d.isFile() || d.isSymbolicLink()) {
          out.push(rel)
        }
      }
    }
    return out
  }

  watch(root: string): void {
    if (this.watchers.has(root)) return
    let watcher: FSWatcher
    try {
      watcher = watch(root, { recursive: true, persistent: false }, (_event, filename) => {
        const w = this.watchers.get(root)
        if (!w) return
        w.pending.push(filename === null ? null : String(filename))
        if (w.timer) clearTimeout(w.timer)
        w.timer = setTimeout(() => this.flush(root), this.debounceMs)
      })
    } catch (e) {
      this.emit('watchError', { root, error: (e as Error).message })
      return
    }
    watcher.on('error', (e) => {
      this.emit('watchError', { root, error: e.message })
      this.unwatch(root)
    })
    this.watchers.set(root, { watcher, pending: [], timer: null })
  }

  unwatch(root: string): void {
    const w = this.watchers.get(root)
    if (!w) return
    if (w.timer) clearTimeout(w.timer)
    try {
      w.watcher.close()
    } catch {
      /* already closed */
    }
    this.watchers.delete(root)
  }

  watching(): string[] {
    return [...this.watchers.keys()]
  }

  dispose(): void {
    for (const root of [...this.watchers.keys()]) this.unwatch(root)
  }

  private flush(root: string): void {
    const w = this.watchers.get(root)
    if (!w) return
    const raw = w.pending
    w.pending = []
    w.timer = null
    if (raw.length === 0) return
    this.emit('changed', coalesceWatchEvents(root, raw))
  }
}
