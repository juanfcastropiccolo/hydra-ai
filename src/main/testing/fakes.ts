// Deterministic fakes for E2E (HYDRA_E2E=1). No real Claude, no real PTY.
import type { AgentEntry, ParseAgentsResult } from '../claude/agents-json'
import type { ClaudeCliLike } from '../claude/claude-cli'
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
  async spawnBackground(opts: { cwd: string; name: string }): Promise<{ bgId: string }> {
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
  /** Test hook: flip a session's reported status (e.g. to 'waiting'). */
  setStatus(bgId: string, status: string, waitingFor?: string): void {
    const e = this.entries.find((x) => x.id === bgId)
    if (!e) return
    e.status = status
    if (waitingFor) e.waitingFor = waitingFor
    else delete e.waitingFor
  }
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
