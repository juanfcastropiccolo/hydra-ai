// Feature 005: index every Claude Code transcript under the projects root into SessionSummary[],
// incrementally (byte offsets + mtime/size), with progress events and a recursive watcher.
//
// Layout it understands (observed with Claude Code 2.1.x):
//   <root>/<project-dir>/<sessionId>.jsonl                      → one session
//   <root>/<project-dir>/<sessionId>/subagents/<agent>.jsonl    → folded into that session
import { EventEmitter } from 'node:events'
import { createReadStream, existsSync, readdirSync, statSync, watch, type FSWatcher } from 'node:fs'
import { basename, join } from 'node:path'
import { isTempCwd } from '@shared/analytics/temp-paths'
import type { AnalyticsProgress, SessionSummary } from '@shared/analytics/types'
import {
  emptyCache,
  loadIndexCache,
  saveIndexCache,
  type CachedFile,
  type IndexCache
} from './index-cache'
import {
  emptyState,
  finalizeSession,
  knowledgeOf,
  reduceTranscriptLine,
  type TranscriptState
} from './transcript-reducer'

export interface AnalyticsIndexerOptions {
  /** `~/.claude/projects` (or a fixture dir in E2E). */
  projectsRoot: string
  /** Where the JSON cache lives (userData). */
  cachePath: string
  timeZone?: string
  tmpdir?: string | null
  watchDebounceMs?: number
  /** Emit `sessions` at most this often while scanning. */
  emitEveryMs?: number
  /** Test seam: run the per-file "yield to the event loop" hook. */
  yieldFn?: () => Promise<void>
}

export interface AnalyticsIndexerEvents {
  progress: [AnalyticsProgress]
  sessions: [SessionSummary[]]
  error: [string]
}

interface ScanTarget {
  /** Top-level session file path. */
  file: string
  sessionId: string
  subagentFiles: string[]
}

const defaultYield = (): Promise<void> => new Promise((r) => setImmediate(r))

export class AnalyticsIndexer extends EventEmitter<AnalyticsIndexerEvents> {
  private cache: IndexCache
  private readonly timeZone: string
  private watcher: FSWatcher | null = null
  private watchTimer: ReturnType<typeof setTimeout> | null = null
  private pendingPaths = new Set<string>()
  private scanning: Promise<void> | null = null
  private rescanRequested = false
  private opened = false
  /** Stats for tests/diagnostics: bytes actually read in the last scan. */
  lastScanBytes = 0
  lastScanFiles = 0
  cacheLoadReason: 'ok' | 'missing' | 'invalid' | 'stale' = 'missing'

  constructor(private readonly opts: AnalyticsIndexerOptions) {
    super()
    this.timeZone = opts.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
    const loaded = loadIndexCache(opts.cachePath, this.timeZone)
    this.cache = loaded.cache
    this.cacheLoadReason = loaded.reason
  }

  /** Sessions from the cache (temp ones excluded). Cheap; safe before/while scanning. */
  sessions(): SessionSummary[] {
    const targets = this.discoverFromCache()
    return this.summaries(targets)
  }

  /** Feature 006: knowledge view per session (same cache, no extra reads). Temp sessions excluded. */
  knowledge(): Array<{
    summary: SessionSummary
    transcriptPath: string
    knowledge: ReturnType<typeof knowledgeOf>
  }> {
    const out: Array<{
      summary: SessionSummary
      transcriptPath: string
      knowledge: ReturnType<typeof knowledgeOf>
    }> = []
    for (const t of this.discoverFromCache()) {
      const main = this.cache.files[t.file]
      if (!main) continue
      const subs = t.subagentFiles
        .map((f) => this.cache.files[f]?.state)
        .filter((s): s is TranscriptState => Boolean(s))
      const summary = finalizeSession(main.state, { sessionId: t.sessionId, subagents: subs })
      if (isTempCwd(summary.cwd, this.opts.tmpdir)) continue
      out.push({ summary, transcriptPath: t.file, knowledge: knowledgeOf(main.state, subs) })
    }
    return out
  }

  /** Start: emit cached sessions immediately, scan in the background, then watch. */
  async open(): Promise<{ sessions: SessionSummary[]; fromCache: boolean }> {
    const fromCache = this.cacheLoadReason === 'ok' && Object.keys(this.cache.files).length > 0
    const initial = this.sessions()
    this.opened = true
    void this.scan().then(() => this.startWatching())
    return { sessions: initial, fromCache }
  }

  close(): void {
    this.opened = false
    this.stopWatching()
  }

  /** Drop the cache and rebuild from scratch. */
  async reindex(): Promise<void> {
    this.cache = emptyCache(this.timeZone)
    saveIndexCache(this.opts.cachePath, this.cache)
    await this.scan()
  }

  /** Full scan of the root (only changed files are read). Serialised: concurrent calls join the in-flight scan. */
  scan(): Promise<void> {
    if (this.scanning) return this.scanning
    const run = this.doScan()
      .catch((e: unknown) => {
        this.emit('error', (e as Error).message)
      })
      .finally(() => {
        this.scanning = null
        if (this.rescanRequested) {
          this.rescanRequested = false
          void this.scan()
        }
      })
    this.scanning = run
    return run
  }

  /** From the watcher: scan now, or once more after the in-flight scan (files may have changed meanwhile). */
  private requestScan(): void {
    if (this.scanning) this.rescanRequested = true
    else void this.scan()
  }

  // ---- discovery -------------------------------------------------------------------------

  private discover(): ScanTarget[] {
    const root = this.opts.projectsRoot
    if (!existsSync(root)) return []
    const out: ScanTarget[] = []
    for (const proj of safeReaddir(root)) {
      const pdir = join(root, proj)
      if (!isDir(pdir)) continue
      for (const entry of safeReaddir(pdir)) {
        if (!entry.endsWith('.jsonl')) continue
        const sessionId = entry.slice(0, -'.jsonl'.length)
        const subDir = join(pdir, sessionId, 'subagents')
        const subagentFiles = isDir(subDir)
          ? safeReaddir(subDir)
              .filter((f) => f.endsWith('.jsonl'))
              .map((f) => join(subDir, f))
          : []
        out.push({ file: join(pdir, entry), sessionId, subagentFiles })
      }
    }
    return out
  }

  private discoverFromCache(): ScanTarget[] {
    const byFile = new Map<string, ScanTarget>()
    for (const p of Object.keys(this.cache.files)) {
      const m = /^(.*)\/([^/]+)\/subagents\/[^/]+\.jsonl$/.exec(p)
      if (m) continue
      if (!p.endsWith('.jsonl')) continue
      byFile.set(p, { file: p, sessionId: basename(p, '.jsonl'), subagentFiles: [] })
    }
    for (const p of Object.keys(this.cache.files)) {
      const m = /^(.*)\/([^/]+)\/subagents\/[^/]+\.jsonl$/.exec(p)
      if (!m) continue
      const parent = `${m[1]}/${m[2]}.jsonl`
      byFile.get(parent)?.subagentFiles.push(p)
    }
    return [...byFile.values()]
  }

  private summaries(targets: ScanTarget[]): SessionSummary[] {
    const out: SessionSummary[] = []
    for (const t of targets) {
      const main = this.cache.files[t.file]
      if (!main) continue
      const subs = t.subagentFiles
        .map((f) => this.cache.files[f]?.state)
        .filter((s): s is TranscriptState => Boolean(s))
      const s = finalizeSession(main.state, { sessionId: t.sessionId, subagents: subs })
      if (isTempCwd(s.cwd, this.opts.tmpdir)) continue
      out.push(s)
    }
    return out
  }

  // ---- scanning --------------------------------------------------------------------------

  private async doScan(): Promise<void> {
    const targets = this.discover()
    const files: string[] = []
    for (const t of targets) files.push(t.file, ...t.subagentFiles)
    const known = new Set(files)
    for (const p of Object.keys(this.cache.files)) if (!known.has(p)) delete this.cache.files[p] // deleted transcripts
    this.lastScanBytes = 0
    this.lastScanFiles = 0
    let done = 0
    const total = files.length
    this.emit('progress', { phase: 'scan', done, total })
    let lastEmit = Date.now()
    let dirty = false
    for (const file of files) {
      const changed = await this.updateFile(file)
      dirty ||= changed
      done++
      const now = Date.now()
      if (dirty && now - lastEmit >= (this.opts.emitEveryMs ?? 500)) {
        lastEmit = now
        this.emit('sessions', this.summaries(targets))
        this.emit('progress', { phase: 'scan', done, total })
        saveIndexCache(this.opts.cachePath, this.cache)
        dirty = false
      } else if (now - lastEmit >= 200) {
        lastEmit = now
        this.emit('progress', { phase: 'scan', done, total })
      }
      await (this.opts.yieldFn ?? defaultYield)()
    }
    saveIndexCache(this.opts.cachePath, this.cache)
    this.emit('sessions', this.summaries(targets))
    this.emit('progress', { phase: this.opened ? 'watch' : 'scan', done: total, total })
  }

  /** Returns true when the file was (re)read. */
  private async updateFile(file: string): Promise<boolean> {
    let st: ReturnType<typeof statSync>
    try {
      st = statSync(file)
    } catch {
      delete this.cache.files[file]
      return true
    }
    const cached = this.cache.files[file]
    if (cached && cached.mtimeMs === st.mtimeMs && cached.size === st.size) return false
    let entry: CachedFile
    if (cached && st.size >= cached.offset && cached.offset > 0) {
      // grew (or same size, new mtime): resume from the byte offset already reduced
      entry = { ...cached, mtimeMs: st.mtimeMs, size: st.size }
    } else {
      entry = { mtimeMs: st.mtimeMs, size: st.size, offset: 0, state: emptyState() }
    }
    const consumed = await this.reduceFrom(file, entry.offset, entry.state)
    entry.offset += consumed
    entry.mtimeMs = st.mtimeMs
    entry.size = st.size
    this.cache.files[file] = entry
    this.lastScanBytes += consumed
    this.lastScanFiles++
    return true
  }

  /** Stream `file` from `start`, reducing complete lines; returns bytes consumed (a trailing partial line is left for next time). */
  private reduceFrom(file: string, start: number, state: TranscriptState): Promise<number> {
    return new Promise((resolve, reject) => {
      let consumed = 0
      let pending = ''
      const stream = createReadStream(file, { start, encoding: 'utf8' })
      stream.on('data', (chunk: string | Buffer) => {
        const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
        pending += text
        let nl = pending.indexOf('\n')
        while (nl >= 0) {
          const line = pending.slice(0, nl)
          pending = pending.slice(nl + 1)
          consumed += Buffer.byteLength(line, 'utf8') + 1
          reduceTranscriptLine(state, line, { timeZone: this.timeZone })
          nl = pending.indexOf('\n')
        }
      })
      stream.on('end', () => resolve(consumed))
      stream.on('error', reject)
    })
  }

  // ---- watching --------------------------------------------------------------------------

  private startWatching(): void {
    if (!this.opened || this.watcher || !existsSync(this.opts.projectsRoot)) return
    try {
      this.watcher = watch(
        this.opts.projectsRoot,
        { recursive: true, persistent: false },
        (_ev, filename) => {
          if (filename && !String(filename).endsWith('.jsonl')) return
          if (filename) this.pendingPaths.add(String(filename))
          if (this.watchTimer) clearTimeout(this.watchTimer)
          this.watchTimer = setTimeout(() => {
            this.watchTimer = null
            this.pendingPaths.clear()
            this.requestScan()
          }, this.opts.watchDebounceMs ?? 3000)
        }
      )
      this.watcher.on('error', (e) => this.emit('error', `watch: ${e.message}`))
    } catch (e) {
      this.emit('error', `watch: ${(e as Error).message}`)
    }
  }

  private stopWatching(): void {
    if (this.watchTimer) clearTimeout(this.watchTimer)
    this.watchTimer = null
    this.watcher?.close()
    this.watcher = null
  }
}

function safeReaddir(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}
function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}
