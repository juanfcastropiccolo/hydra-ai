// SessionWatcher: the single source of Session objects for the renderer.
//  - PULL: polls `claude agents --json` every `pollMs` (reconciliation, discovers external sessions)
//  - PUSH: HookEvents from HooksServer (instant state for sessions Hydra spawned)
// A hook always beats an older poll; a poll only overrides hook state if it is newer.
import { EventEmitter } from 'node:events'
import type { Project, Session, SessionState } from '@shared/types'
import type { AgentEntry } from '../claude/agents-json'
import { mapSessionState } from '../claude/session-state'
import { hookEventToState, type HookEvent } from '../hooks/hook-events'
import { buildProjectIndex, matchProject, type ProjectPathIndex } from './project-match'

export interface SessionWatcherDeps {
  listSessions: () => Promise<{ entries: AgentEntry[]; error?: string }>
  getProjects: () => Project[]
  realpath: (p: string) => string
  now?: () => number
  setInterval?: typeof globalThis.setInterval
  clearInterval?: typeof globalThis.clearInterval
  pollMs?: number
  /** Ended sessions Hydra did not spawn are dropped from the list after this long (default 5 min). */
  endedTtlMs?: number
}

export const DEFAULT_ENDED_TTL_MS = 5 * 60_000

export interface SessionWatcherEvents {
  changed: [Session[]]
  pollError: [string]
}

export class SessionWatcher extends EventEmitter<SessionWatcherEvents> {
  private sessions = new Map<string, Session>()
  /** sessionIds (and bgIds) Hydra itself spawned, to tag origin. */
  private ownedBgIds = new Set<string>()
  private ownedSessionIds = new Set<string>()
  private timer: ReturnType<typeof setInterval> | null = null
  private polling = false
  private index: ProjectPathIndex = { byId: new Map() }
  private readonly now: () => number
  private readonly pollMs: number
  private readonly endedTtlMs: number

  constructor(private readonly deps: SessionWatcherDeps) {
    super()
    this.now = deps.now ?? Date.now
    this.pollMs = deps.pollMs ?? 2000
    this.endedTtlMs = deps.endedTtlMs ?? DEFAULT_ENDED_TTL_MS
    this.refreshProjectIndex()
  }

  list(): Session[] {
    return [...this.sessions.values()]
  }

  get(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId)
  }

  /** Call when the project list changes so cwd→project assignment is recomputed. */
  refreshProjectIndex(): void {
    this.index = buildProjectIndex(this.deps.getProjects(), this.deps.realpath)
    let changed = false
    for (const s of this.sessions.values()) {
      const pid = matchProject(s.cwd, this.index, this.deps.realpath)
      if (pid !== s.projectId) {
        s.projectId = pid
        changed = true
      }
    }
    if (changed) this.emitChanged()
  }

  /** Tag a bg id as spawned by Hydra (call right after `claude --bg`). */
  markOwned(bgId: string): void {
    this.ownedBgIds.add(bgId)
  }

  start(): void {
    if (this.timer) return
    const si = this.deps.setInterval ?? setInterval
    this.timer = si(() => void this.poll(), this.pollMs)
    void this.poll()
  }

  stop(): void {
    if (!this.timer) return
    ;(this.deps.clearInterval ?? clearInterval)(this.timer)
    this.timer = null
  }

  /** One reconciliation pass. Safe to call directly (tests, after spawn). */
  async poll(): Promise<void> {
    if (this.polling) return
    this.polling = true
    try {
      const r = await this.deps.listSessions()
      if (r.error) {
        this.emit('pollError', r.error)
        return
      }
      this.applyEntries(r.entries, this.now())
    } finally {
      this.polling = false
    }
  }

  /** Apply a hook event (push). Unknown sessions are ignored until the next poll discovers them. */
  applyHook(ev: HookEvent): void {
    const s = this.sessions.get(ev.sessionId)
    const state = hookEventToState(ev)
    this.ownedSessionIds.add(ev.sessionId) // only Hydra-spawned sessions carry our hooks
    if (!s) return
    let changed = false
    if (s.origin !== 'hydra') {
      s.origin = 'hydra'
      changed = true
    }
    if (state && (state !== s.state || ev.receivedAt >= s.lastStateAt)) {
      s.state = state
      s.lastStateAt = ev.receivedAt
      s.source = 'hook'
      if (state !== 'waiting') delete s.waitingFor
      changed = true
    }
    if (changed) this.emitChanged()
  }

  private applyEntries(entries: AgentEntry[], at: number): void {
    const seen = new Set<string>()
    let changed = false
    for (const e of entries) {
      const sessionId =
        e.sessionId ?? (e.id ? `bg:${e.id}` : `pid:${e.pid ?? 'unknown'}:${e.startedAt}`)
      seen.add(sessionId)
      const mapped = mapSessionState(e)
      const projectId = matchProject(e.cwd, this.index, this.deps.realpath)
      const owned =
        (e.id !== undefined && this.ownedBgIds.has(e.id)) || this.ownedSessionIds.has(sessionId)
      const existing = this.sessions.get(sessionId)
      if (!existing) {
        this.sessions.set(sessionId, {
          sessionId,
          bgId: e.id,
          kind: e.kind,
          name: e.name ?? e.id ?? `session-${e.pid ?? e.startedAt}`,
          cwd: e.cwd,
          projectId,
          pid: e.pid,
          startedAt: e.startedAt,
          state: mapped.state,
          waitingFor: mapped.waitingFor,
          lastStateAt: at,
          source: 'poll',
          origin: owned ? 'hydra' : 'external'
        })
        changed = true
        continue
      }
      // Update identity-ish fields that can change (bg id appears when an interactive session is backgrounded).
      const before = JSON.stringify(existing)
      existing.bgId = e.id ?? existing.bgId
      existing.kind = e.kind
      existing.name = e.name ?? existing.name
      existing.pid = e.pid
      existing.projectId = projectId
      if (owned) existing.origin = 'hydra'
      // State: a poll may only override a hook-sourced state that is older than this poll.
      const newer = existing.source === 'poll' || at > existing.lastStateAt
      if (newer && mapped.state !== existing.state) {
        existing.state = mapped.state
        existing.waitingFor = mapped.waitingFor
        existing.lastStateAt = at
        existing.source = 'poll'
      } else if (newer && mapped.state === 'waiting' && mapped.waitingFor !== existing.waitingFor) {
        existing.waitingFor = mapped.waitingFor
      }
      if (JSON.stringify(existing) !== before) changed = true
    }
    // Sessions that disappeared from the listing are over.
    for (const s of this.sessions.values()) {
      if (!seen.has(s.sessionId) && s.state !== 'ended') {
        s.state = 'ended'
        s.lastStateAt = at
        s.source = 'poll'
        delete s.waitingFor
        changed = true
        continue
      }
      // External ended sessions have no pane to close them from (and a headless run can leave
      // hundreds behind), so they expire on their own. Hydra-owned ones keep their "ended"
      // overlay until the user closes the pane (forget). lastStateAt == when it became ended.
      if (s.state === 'ended' && s.origin === 'external' && at - s.lastStateAt >= this.endedTtlMs) {
        this.sessions.delete(s.sessionId)
        changed = true
      }
    }
    if (changed) this.emitChanged()
  }

  /** Remove ended sessions from memory (e.g. after the user closes a finished pane). */
  forget(sessionId: string): void {
    if (this.sessions.delete(sessionId)) this.emitChanged()
  }

  private emitChanged(): void {
    this.emit('changed', this.list())
  }
}

export type { SessionState }
