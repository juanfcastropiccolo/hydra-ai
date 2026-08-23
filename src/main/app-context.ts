// Wires the main-process services together. Created once at startup; owns lifecycle.
import { realpathSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { BrowserWindow } from 'electron'
import type { ClaudeAvailability, Session } from '@shared/types'
import type { IpcEvents } from '@shared/ipc'
import { ClaudeCli, type ClaudeCliLike } from './claude/claude-cli'
import { AnalyticsIndexer } from './analytics/analytics-indexer'
import { ContextImporter } from './context/context-importer'
import { FsActions } from './fs/fs-actions'
import { FsService } from './fs/fs-service'
import { GitService } from './git/git-service'
import { resolveEnv, type ResolvedEnv } from './env/env-resolver'
import { buildHookSettingsJson } from './hooks/hook-events'
import { HooksServer } from './hooks/hooks-server'
import { nodePtySpawn, PtyManager, type PtySpawn } from './pty/pty-manager'
import { SessionWatcher } from './sessions/session-watcher'
import { ProjectStore } from './store/project-store'

export interface AppContextOptions {
  hydraFilePath: string
  /** Feature 005: where the transcript index cache lives (userData). */
  analyticsCachePath: string
  /** Feature 005: transcripts root; default ~/.claude/projects (E2E points it at a fixture dir). */
  claudeProjectsRoot?: string
  /** Test hook: fake PTY factory (E2E mode). */
  ptySpawn?: PtySpawn
  /** Test hook: force "claude not found" (HYDRA_FAKE_NO_CLAUDE=1). */
  fakeNoClaude?: boolean
  /** Test hook: inject a fake CLI (E2E). Skips EnvResolver's binary lookup. */
  fakeCli?: ClaudeCliLike
  pollMs?: number
}

export class AppContext {
  readonly store: ProjectStore
  readonly hooks = new HooksServer()
  readonly pty: PtyManager
  readonly fs = new FsService()
  git!: GitService
  fsActions!: FsActions
  cli: ClaudeCliLike | null = null
  watcher: SessionWatcher | null = null
  /** Feature 004: handoff summaries of other sessions (null until the CLI is available). */
  importer: ContextImporter | null = null
  /** Feature 005: transcript index (created lazily on first analytics.open). */
  private analytics: AnalyticsIndexer | null = null
  availability: ClaudeAvailability = {
    ok: false,
    reason: 'error',
    message: 'not initialised',
    hint: ''
  }
  private resolved: ResolvedEnv | null = null
  private windows = new Set<BrowserWindow>()
  /** ptyId → sessionId, so pty events can be related back to sessions. */
  readonly ptySessions = new Map<string, string>()

  constructor(private readonly opts: AppContextOptions) {
    this.store = new ProjectStore({ filePath: opts.hydraFilePath })
    this.pty = new PtyManager(opts.ptySpawn ?? nodePtySpawn())
  }

  async init(): Promise<void> {
    this.store.load()
    await this.hooks.start()
    this.resolved = await resolveEnv()
    this.git = new GitService({ env: this.resolved.env })
    this.fsActions = new FsActions(this.resolved.env)
    // Feature 002: forward fs changes + refreshed git status to the renderer.
    this.fs.on('changed', (ev) => {
      this.broadcast('fs.changed', ev)
      void this.git
        .status(ev.root)
        .then((result) => this.broadcast('git.changed', { root: ev.root, result }))
    })
    this.availability = this.opts.fakeNoClaude
      ? {
          ok: false,
          reason: 'not-found',
          message: 'Modo de prueba: Claude Code deshabilitado (HYDRA_FAKE_NO_CLAUDE=1).',
          hint: 'Quitá la variable de entorno para volver a habilitarlo.'
        }
      : this.resolved.claude
    if (this.opts.fakeCli) {
      this.availability = { ok: true, binaryPath: this.opts.fakeCli.binaryPath }
    }
    if (this.availability.ok) {
      this.cli =
        this.opts.fakeCli ??
        new ClaudeCli({ binaryPath: this.availability.binaryPath, env: this.resolved.env })
      const version = await this.cli.version()
      if (version) this.availability = { ...this.availability, version }
      const cli = this.cli
      this.watcher = new SessionWatcher({
        listSessions: () => cli.listSessions({ all: true }),
        getProjects: () => this.store.listProjects(),
        realpath: (p) => realpathSync(p),
        pollMs: this.opts.pollMs
      })
      this.watcher.on('changed', (sessions) =>
        this.broadcast('sessions.changed', { sessions: this.decorate(sessions) })
      )
      this.hooks.on('event', (ev) => this.watcher?.applyHook(ev))
      this.watcher.start()
      this.importer = new ContextImporter({
        cli: () => cli,
        // decorated: the block names the session the way the user sees it (alias, FR-11)
        getSession: (id) => this.sessions().find((s) => s.sessionId === id),
        getProject: (id) => this.store.getProject(id),
        prefs: () => this.store.importContext()
      })
    }
    this.pty.on('data', (e) => this.broadcast('pty.data', e))
    this.pty.on('exit', (e) => this.broadcast('pty.exit', e))
  }

  attachWindow(win: BrowserWindow): void {
    this.windows.add(win)
    win.on('closed', () => this.windows.delete(win))
  }

  broadcast<C extends keyof IpcEvents>(channel: C, payload: IpcEvents[C]): void {
    for (const w of this.windows) {
      if (w.isDestroyed() || w.webContents.isDestroyed()) continue
      try {
        w.webContents.send(channel, payload)
      } catch {
        /* window is going away */
      }
    }
  }

  get env(): NodeJS.ProcessEnv {
    return this.resolved?.env ?? process.env
  }

  requireCli(): ClaudeCliLike {
    if (!this.cli)
      throw new Error(this.availability.ok ? 'CLI not initialised' : this.availability.message)
    return this.cli
  }

  /** Apply user-chosen display names (Hydra-side alias; the CLI has no rename for bg sessions). */
  decorate(sessions: Session[]): Session[] {
    const names = this.store.sessionNames()
    return sessions.map((s) => (names[s.sessionId] ? { ...s, name: names[s.sessionId]! } : s))
  }

  sessions(): Session[] {
    return this.decorate(this.watcher?.list() ?? [])
  }

  renameSession(sessionId: string, name: string): void {
    if (!name.trim()) throw new Error('El nombre no puede estar vacío')
    this.store.setSessionName(sessionId, name)
    this.broadcast('sessions.changed', { sessions: this.sessions() })
  }

  /** Suggest `<project>-<n>` where n is 1 + number of sessions already in that project. */
  suggestSessionName(projectId: string): string {
    const p = this.store.getProject(projectId)
    const base =
      (p?.name ?? 'session')
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'session'
    const taken = new Set(
      this.sessions()
        .filter((s) => s.projectId === projectId)
        .map((s) => s.name)
    )
    let n = taken.size + 1
    while (taken.has(`${base}-${n}`)) n++
    return `${base}-${n}`
  }

  async createSession(projectId: string, name: string, cwd?: string): Promise<Session> {
    const cli = this.requireCli()
    const project = this.store.getProject(projectId)
    if (!project) throw new Error('Proyecto no encontrado')
    if (project.missing) throw new Error(`La carpeta del proyecto no existe: ${project.path}`)
    const sessionCwd = cwd ?? project.path
    if (cwd) {
      const inside = this.store.listProjects().some((p) => {
        const root = p.path.replace(/\/+$/, '')
        return cwd === root || cwd.startsWith(root + '/')
      })
      if (!inside) throw new Error('La carpeta elegida no pertenece a ningún proyecto registrado')
    }
    const trimmed = name.trim()
    if (!trimmed) throw new Error('El nombre de la sesión no puede estar vacío')
    const { bgId } = await cli.spawnBackground({
      cwd: sessionCwd,
      name: trimmed,
      settingsJson: buildHookSettingsJson(this.hooks.port)
    })
    this.watcher?.markOwned(bgId)
    await this.watcher?.poll()
    const found = this.sessions().find((s) => s.bgId === bgId)
    if (found) return found
    // Listing may lag a moment; synthesise a provisional record the next poll will replace.
    return {
      sessionId: `bg:${bgId}`,
      bgId,
      kind: 'background',
      name: trimmed,
      cwd: sessionCwd,
      projectId,
      startedAt: Date.now(),
      state: 'idle',
      lastStateAt: Date.now(),
      source: 'poll',
      origin: 'hydra'
    }
  }

  async stopSession(sessionId: string): Promise<void> {
    const cli = this.requireCli()
    const s = this.watcher?.get(sessionId)
    if (!s?.bgId) throw new Error('Solo se pueden terminar sesiones en background (con id)')
    for (const [ptyId, sid] of this.ptySessions) if (sid === sessionId) this.closePty(ptyId)
    await cli.stop(s.bgId)
    await cli.remove(s.bgId)
    this.watcher?.forget(sessionId)
  }

  openPty(sessionId: string, cols: number, rows: number): string {
    const cli = this.requireCli()
    const s = this.watcher?.get(sessionId)
    if (!s?.bgId) throw new Error('Esta sesión no es adjuntable (no está en background)')
    const ptyId = randomUUID()
    this.pty.open({
      ptyId,
      file: cli.binaryPath,
      args: ['attach', s.bgId],
      cwd: s.cwd,
      env: this.env,
      cols,
      rows
    })
    this.ptySessions.set(ptyId, sessionId)
    return ptyId
  }

  closePty(ptyId: string): void {
    this.pty.close(ptyId)
    this.ptySessions.delete(ptyId)
  }

  // ---- feature 005 ----
  analyticsIndexer(): AnalyticsIndexer {
    if (!this.analytics) {
      const ix = new AnalyticsIndexer({
        projectsRoot: this.opts.claudeProjectsRoot ?? join(homedir(), '.claude', 'projects'),
        cachePath: this.opts.analyticsCachePath,
        tmpdir: tmpdir()
      })
      ix.on('progress', (p) => this.broadcast('analytics.progress', p))
      ix.on('sessions', (sessions) =>
        this.broadcast('analytics.sessions', { sessions, now: this.analyticsNow() })
      )
      ix.on('error', (msg) => console.error('[analytics]', msg))
      this.analytics = ix
    }
    return this.analytics
  }

  /** Wall clock for the dashboard; E2E pins it with HYDRA_E2E_NOW (ISO or ms). */
  analyticsNow(): number {
    const pinned = process.env['HYDRA_E2E_NOW']
    if (pinned) {
      const n = /^\d+$/.test(pinned) ? Number(pinned) : Date.parse(pinned)
      if (Number.isFinite(n)) return n
    }
    return Date.now()
  }

  async dispose(): Promise<void> {
    this.analytics?.close()
    this.importer?.dispose()
    this.fs.dispose()
    this.watcher?.stop()
    this.pty.disposeAll() // clients only; sessions keep running (FR-10)
    await this.hooks.stop()
  }
}
