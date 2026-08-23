// Feature 005 FR-12: on-disk cache of per-transcript reducer states. Plain JSON, atomic write,
// versioned (a version bump or a corrupt file → start empty, never throw).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { TranscriptState } from './transcript-reducer'

export const INDEX_CACHE_VERSION = 2 // v2: knowledge pass fields in TranscriptState (006)

export interface CachedFile {
  mtimeMs: number
  size: number
  /** Bytes of the file already reduced into `state`. */
  offset: number
  state: TranscriptState
}

export interface IndexCache {
  version: number
  /** Time zone the buckets were computed in (a change → reindex). */
  timeZone: string
  files: Record<string, CachedFile>
}

export function emptyCache(timeZone: string): IndexCache {
  return { version: INDEX_CACHE_VERSION, timeZone, files: {} }
}

export function loadIndexCache(
  path: string,
  timeZone: string
): { cache: IndexCache; reason: 'ok' | 'missing' | 'invalid' | 'stale' } {
  if (!existsSync(path)) return { cache: emptyCache(timeZone), reason: 'missing' }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<IndexCache>
    if (
      raw.version !== INDEX_CACHE_VERSION ||
      raw.timeZone !== timeZone ||
      typeof raw.files !== 'object' ||
      !raw.files
    )
      return { cache: emptyCache(timeZone), reason: 'stale' }
    return { cache: { version: INDEX_CACHE_VERSION, timeZone, files: raw.files }, reason: 'ok' }
  } catch {
    return { cache: emptyCache(timeZone), reason: 'invalid' }
  }
}

export function saveIndexCache(path: string, cache: IndexCache): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(cache), 'utf8')
  renameSync(tmp, path)
}
