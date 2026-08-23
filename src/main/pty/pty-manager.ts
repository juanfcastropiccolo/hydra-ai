// PtyManager: one real PTY per visible pane, running `claude attach <bgId>`.
// Killing a PTY only kills the attach *client*; the session keeps living in the daemon.
import { EventEmitter } from 'node:events'

/** Minimal surface we need from node-pty (lets unit tests inject a fake). */
export interface PtyProcess {
  pid: number
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(signal?: string): void
  onData(cb: (data: string) => void): { dispose(): void }
  onExit(cb: (e: { exitCode: number; signal?: number }) => void): { dispose(): void }
}
export interface PtySpawnOptions {
  name: string
  cols: number
  rows: number
  cwd: string
  env: NodeJS.ProcessEnv
}
export type PtySpawn = (file: string, args: string[], opts: PtySpawnOptions) => PtyProcess

export interface PtyOpenRequest {
  ptyId: string
  file: string
  args: string[]
  cwd: string
  env: NodeJS.ProcessEnv
  cols: number
  rows: number
}

export interface PtyManagerEvents {
  data: [{ ptyId: string; data: string }]
  exit: [{ ptyId: string; exitCode: number }]
}

const DEFAULT_SCROLLBACK_BYTES = 256 * 1024

interface Entry {
  proc: PtyProcess
  buffer: string[]
  bufferBytes: number
  exited: boolean
}

export class PtyManager extends EventEmitter<PtyManagerEvents> {
  private readonly entries = new Map<string, Entry>()

  constructor(
    private readonly spawn: PtySpawn,
    private readonly scrollbackBytes = DEFAULT_SCROLLBACK_BYTES
  ) {
    super()
  }

  has(ptyId: string): boolean {
    return this.entries.has(ptyId)
  }

  open(req: PtyOpenRequest): void {
    if (this.entries.has(req.ptyId)) throw new Error(`pty ${req.ptyId} already open`)
    const proc = this.spawn(req.file, req.args, {
      name: 'xterm-256color',
      cols: req.cols,
      rows: req.rows,
      cwd: req.cwd,
      env: req.env
    })
    const entry: Entry = { proc, buffer: [], bufferBytes: 0, exited: false }
    this.entries.set(req.ptyId, entry)
    proc.onData((data) => {
      this.appendScrollback(entry, data)
      this.emit('data', { ptyId: req.ptyId, data })
    })
    proc.onExit(({ exitCode }) => {
      entry.exited = true
      this.emit('exit', { ptyId: req.ptyId, exitCode })
    })
  }

  write(ptyId: string, data: string): void {
    const e = this.entries.get(ptyId)
    if (e && !e.exited) e.proc.write(data)
  }

  resize(ptyId: string, cols: number, rows: number): void {
    const e = this.entries.get(ptyId)
    if (!e || e.exited) return
    if (cols < 2 || rows < 1 || !Number.isFinite(cols) || !Number.isFinite(rows)) return
    e.proc.resize(Math.floor(cols), Math.floor(rows))
  }

  /** Last N KB of raw output, to repaint a remounted terminal. */
  scrollback(ptyId: string): string {
    return this.entries.get(ptyId)?.buffer.join('') ?? ''
  }

  close(ptyId: string): void {
    const e = this.entries.get(ptyId)
    if (!e) return
    this.entries.delete(ptyId)
    if (!e.exited) {
      try {
        e.proc.kill()
      } catch {
        /* already gone */
      }
    }
  }

  /** Kill every attach client. Sessions survive in the daemon (FR-10). */
  disposeAll(): void {
    for (const id of [...this.entries.keys()]) this.close(id)
  }

  private appendScrollback(e: Entry, data: string): void {
    e.buffer.push(data)
    e.bufferBytes += data.length
    while (e.bufferBytes > this.scrollbackBytes && e.buffer.length > 1) {
      const dropped = e.buffer.shift()
      e.bufferBytes -= dropped?.length ?? 0
    }
  }
}

/** Default spawn backed by @lydell/node-pty. Loaded lazily so unit tests never touch native code. */
export function nodePtySpawn(): PtySpawn {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pty = require('@lydell/node-pty') as {
    spawn: (file: string, args: string[], opts: PtySpawnOptions) => PtyProcess
  }
  return (file, args, opts) => pty.spawn(file, args, opts)
}
