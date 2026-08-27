// Deterministic fakes for E2E (HYDRA_E2E=1). No real Claude, no real PTY.
import type { AgentEntry, ParseAgentsResult } from '../claude/agents-json'
import type {
  ClaudeCliLike,
  RunPromptOptions,
  SpawnBackgroundOptions,
  SummarizeOptions,
  SummarizeResult
} from '../claude/claude-cli'
import type { PtyProcess, PtySpawn, PtySpawnOptions } from '../pty/pty-manager'

export class FakeClaudeCli implements ClaudeCliLike {
  readonly binaryPath = '/fake/claude'
  private entries: AgentEntry[] = []
  private n = 0

  async version(): Promise<string> {
    return '0.0.0-e2e'
  }
  async listSessions(): Promise<ParseAgentsResult> {
    return { entries: this.entries.map((e) => ({ ...e })), skipped: 0 }
  }
  /** Feature 007 E2E: every spawn's options, so tests can assert model/effort/permission flags. */
  readonly spawns: SpawnBackgroundOptions[] = []
  async spawnBackground(opts: SpawnBackgroundOptions): Promise<{ bgId: string }> {
    this.spawns.push({ ...opts })
    this.n++
    const bgId = `fake${String(this.n).padStart(4, '0')}`
    this.entries.push({
      cwd: opts.cwd,
      kind: 'background',
      startedAt: 1_700_000_000_000 + this.n,
      pid: 1000 + this.n,
      id: bgId,
      sessionId: `00000000-0000-0000-0000-${String(this.n).padStart(12, '0')}`,
      name: opts.name,
      status: 'idle',
      state: 'blocked'
    })
    return { bgId }
  }
  async stop(bgId: string): Promise<void> {
    const e = this.entries.find((x) => x.id === bgId)
    if (e) {
      e.state = 'stopped'
      delete e.pid
    }
  }
  async remove(bgId: string): Promise<void> {
    this.entries = this.entries.filter((x) => x.id !== bgId)
  }
  async findByBgId(bgId: string): Promise<AgentEntry | undefined> {
    return this.entries.find((x) => x.id === bgId)
  }
  /**
   * Feature 004: canned handoff summary after `HYDRA_E2E_SUMMARY_DELAY_MS` (default 300 ms).
   * Honours `signal` (rejects with AbortError) and fails for unknown session ids.
   */
  async summarizeSession(opts: SummarizeOptions): Promise<SummarizeResult> {
    const e = this.entries.find((x) => x.sessionId === opts.sessionId) ?? {
      name: opts.sessionId
    }
    const delay = Number(process.env['HYDRA_E2E_SUMMARY_DELAY_MS'] ?? 300)
    await new Promise<void>((resolve, reject) => {
      if (opts.signal?.aborted) return reject(abortError())
      const t = setTimeout(() => {
        opts.signal?.removeEventListener('abort', onAbort)
        resolve()
      }, delay)
      const onAbort = (): void => {
        clearTimeout(t)
        reject(abortError())
      }
      opts.signal?.addEventListener('abort', onAbort, { once: true })
    })
    const text = [
      '## Objetivo',
      `Resumen falso de la sesión "${e.name ?? opts.sessionId}" (modelo ${opts.model}).`,
      '## Decisiones tomadas',
      '- Usar bracketed paste.',
      '## Datos y nombres clave',
      '- Palabra clave: PELICANO-42',
      '## Estado actual',
      'En progreso.',
      '## Pendientes',
      '- Medir latencia.'
    ].join('\n')
    return { text, raw: { ok: true, text } }
  }
  /** Feature 006: canned card JSON (or echo) for runPrompt. */
  async runPrompt(opts: RunPromptOptions): Promise<SummarizeResult> {
    const text = JSON.stringify({
      summary: `Ficha falsa de ${opts.resumeSessionId ?? 'ad-hoc'}`,
      facts: [
        {
          text: 'Se decidió usar bracketed paste',
          kind: 'decision',
          entities: ['paste', 'src/shared/paste.ts']
        }
      ],
      superseded_ids: []
    })
    return { text, raw: { ok: true, text } }
  }

  /** Feature 006: in-memory MCP registry for E2E. */
  readonly mcpRegistry = new Map<string, string>()
  async mcpAdd(name: string, url: string): Promise<void> {
    this.mcpRegistry.set(name, url)
  }
  async mcpGet(name: string): Promise<{ registered: boolean; url?: string }> {
    const url = this.mcpRegistry.get(name)
    return url ? { registered: true, url } : { registered: false }
  }
  async mcpRemove(name: string): Promise<void> {
    this.mcpRegistry.delete(name)
  }

  /** Test hook: flip a session's reported status (e.g. to 'waiting'). */
  setStatus(bgId: string, status: string, waitingFor?: string): void {
    const e = this.entries.find((x) => x.id === bgId)
    if (!e) return
    e.status = status
    if (waitingFor) e.waitingFor = waitingFor
    else delete e.waitingFor
  }
}

function abortError(): Error {
  const err = new Error('The operation was aborted')
  err.name = 'AbortError'
  return err
}

export interface FakePtyRecord {
  args: string[]
  writes: string[]
  resizes: Array<{ cols: number; rows: number }>
  killed: boolean
}

/** Echo PTY: prints a banner on open, echoes writes back. Records everything for assertions. */
export function createFakePtySpawn(): { spawn: PtySpawn; records: Map<number, FakePtyRecord> } {
  const records = new Map<number, FakePtyRecord>()
  let pid = 0
  const spawn: PtySpawn = (_file: string, args: string[], opts: PtySpawnOptions): PtyProcess => {
    const myPid = ++pid
    const rec: FakePtyRecord = {
      args,
      writes: [],
      resizes: [{ cols: opts.cols, rows: opts.rows }],
      killed: false
    }
    records.set(myPid, rec)
    const dataCbs: Array<(d: string) => void> = []
    const exitCbs: Array<(e: { exitCode: number }) => void> = []
    const emit = (d: string): void => dataCbs.forEach((cb) => cb(d))
    setTimeout(() => emit(`\r\n[fake tui pid=${myPid}] ${args.join(' ')}\r\n> `), 20)
    return {
      pid: myPid,
      write: (d) => {
        rec.writes.push(d)
        emit(d)
      },
      resize: (cols, rows) => {
        rec.resizes.push({ cols, rows })
      },
      kill: () => {
        rec.killed = true
        exitCbs.forEach((cb) => cb({ exitCode: 0 }))
      },
      onData: (cb) => {
        dataCbs.push(cb)
        return { dispose: () => dataCbs.splice(dataCbs.indexOf(cb), 1) }
      },
      onExit: (cb) => {
        exitCbs.push(cb)
        return { dispose: () => exitCbs.splice(exitCbs.indexOf(cb), 1) }
      }
    }
  }
  return { spawn, records }
}
