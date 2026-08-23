// Thin, typed wrapper over the public `claude` CLI. Every subprocess Hydra runs against
// Claude Code goes through here, so the contract (flags, output formats) lives in one place.
import { execFile } from 'node:child_process'
import { parsePrintJson, type PrintJsonOk } from '../context/print-json'
import { parseAgentsJson, type AgentEntry, type ParseAgentsResult } from './agents-json'

export interface ExecResult {
  stdout: string
  stderr: string
  code: number
}

/** Injectable runner so unit tests never spawn processes. Aborting `signal` kills the child. */
export type Runner = (
  args: string[],
  opts: { cwd?: string; timeoutMs: number; signal?: AbortSignal }
) => Promise<ExecResult>

export interface ClaudeCliOptions {
  binaryPath: string
  env: NodeJS.ProcessEnv
  runner?: Runner
  defaultTimeoutMs?: number
}

/** Pure: parse the confirmation line printed by `claude --bg`. */
export function parseBackgroundedLine(stdout: string): { id: string; name?: string } | null {
  // e.g. "backgrounded · 7fd3402f · hydra-probe (idle — send a prompt to start)"
  const m = stdout.match(/backgrounded\s+·\s+([0-9a-f]{6,})\s*(?:·\s*([^\n(]+?))?\s*(?:\(|\n|$)/)
  if (!m?.[1]) return null
  const name = m[2]?.trim()
  return name ? { id: m[1], name } : { id: m[1] }
}

export class ClaudeCliError extends Error {
  constructor(
    message: string,
    readonly result?: ExecResult
  ) {
    super(message)
    this.name = 'ClaudeCliError'
  }
}

/** The subset AppContext depends on; FakeClaudeCli (E2E) implements it too. */
export interface ClaudeCliLike {
  readonly binaryPath: string
  version(): Promise<string | undefined>
  listSessions(opts?: { all?: boolean; cwd?: string }): Promise<ParseAgentsResult>
  spawnBackground(opts: {
    cwd: string
    name: string
    settingsJson?: string
  }): Promise<{ bgId: string }>
  stop(bgId: string): Promise<void>
  remove(bgId: string): Promise<void>
  findByBgId(bgId: string): Promise<AgentEntry | undefined>
  /** Feature 004: handoff summary of a session via `claude -p --resume --fork-session`. */
  summarizeSession(opts: SummarizeOptions): Promise<SummarizeResult>
  /** Feature 006: generic one-shot prompt (optionally resuming a conversation). */
  runPrompt(opts: RunPromptOptions): Promise<SummarizeResult>
  /** Feature 006: register/inspect/remove the hydra-know MCP server in the user's Claude config. */
  mcpAdd(name: string, url: string): Promise<void>
  mcpGet(name: string): Promise<{ registered: boolean; url?: string }>
  mcpRemove(name: string): Promise<void>
}

export interface RunPromptOptions {
  cwd: string
  model: string
  prompt: string
  /** When set, the prompt runs over that conversation (fork, no persistence). */
  resumeSessionId?: string
  signal?: AbortSignal
  timeoutMs?: number
}

export interface SummarizeOptions {
  /** Full session UUID (from `agents --json`). */
  sessionId: string
  /** Must be the session's own cwd: `--resume` looks the transcript up by project dir. */
  cwd: string
  model: string
  prompt: string
  signal?: AbortSignal
  /** Default 90 s (spec FR-8). */
  timeoutMs?: number
}
export interface SummarizeResult {
  text: string
  raw: PrintJsonOk
}

export class ClaudeCli implements ClaudeCliLike {
  private readonly runner: Runner
  private readonly timeoutMs: number

  constructor(private readonly opts: ClaudeCliOptions) {
    this.timeoutMs = opts.defaultTimeoutMs ?? 30_000
    this.runner = opts.runner ?? this.defaultRunner
  }

  get binaryPath(): string {
    return this.opts.binaryPath
  }

  get env(): NodeJS.ProcessEnv {
    return this.opts.env
  }

  private defaultRunner: Runner = (args, { cwd, timeoutMs, signal }) =>
    new Promise((resolve, reject) => {
      const child = execFile(
        this.opts.binaryPath,
        args,
        {
          cwd,
          env: this.opts.env,
          timeout: timeoutMs,
          signal,
          encoding: 'utf8',
          maxBuffer: 8 * 1024 * 1024
        },
        (err, stdout, stderr) => {
          if (err && (err as NodeJS.ErrnoException).name === 'AbortError') {
            reject(err)
            return
          }
          const code =
            err && typeof (err as NodeJS.ErrnoException & { code?: unknown }).code === 'number'
              ? (err as { code: number }).code
              : err
                ? 1
                : 0
          resolve({ stdout: String(stdout ?? ''), stderr: String(stderr ?? ''), code })
        }
      )
      // `claude -p` waits up to 3 s for piped stdin before proceeding; we never feed it.
      child.stdin?.end()
    })

  /** `claude --version` → e.g. "2.1.241 (Claude Code)". */
  async version(): Promise<string | undefined> {
    const r = await this.runner(['--version'], { timeoutMs: 10_000 })
    return r.code === 0 ? r.stdout.trim() : undefined
  }

  /** `claude agents --json [--all]`. Never throws; see ParseAgentsResult.error. */
  async listSessions(opts: { all?: boolean; cwd?: string } = {}): Promise<ParseAgentsResult> {
    const args = ['agents', '--json']
    if (opts.all) args.push('--all')
    if (opts.cwd) args.push('--cwd', opts.cwd)
    const r = await this.runner(args, { timeoutMs: this.timeoutMs })
    if (r.code !== 0) {
      return {
        entries: [],
        skipped: 0,
        error: `claude agents exited ${r.code}: ${r.stderr || r.stdout}`.trim()
      }
    }
    return parseAgentsJson(r.stdout)
  }

  /**
   * `claude --bg --name <name> [--settings <json>]` in `cwd`, without an initial prompt.
   * Resolves with the short background id once the CLI confirms.
   */
  async spawnBackground(opts: {
    cwd: string
    name: string
    settingsJson?: string
  }): Promise<{ bgId: string }> {
    const args = ['--bg', '--name', opts.name]
    if (opts.settingsJson) args.push('--settings', opts.settingsJson)
    const r = await this.runner(args, { cwd: opts.cwd, timeoutMs: this.timeoutMs })
    const parsed = parseBackgroundedLine(r.stdout)
    if (r.code !== 0 || !parsed) {
      throw new ClaudeCliError(
        `claude --bg failed (exit ${r.code}): ${(r.stderr || r.stdout).trim()}`,
        r
      )
    }
    return { bgId: parsed.id }
  }

  /** `claude stop <id>`; tolerant if already stopped. */
  async stop(bgId: string): Promise<void> {
    await this.runner(['stop', bgId], { timeoutMs: this.timeoutMs })
  }

  /** `claude rm <id>`; tolerant if already removed. */
  async remove(bgId: string): Promise<void> {
    await this.runner(['rm', bgId], { timeoutMs: this.timeoutMs })
  }

  /**
   * `claude -p [--resume <id> --fork-session] --no-session-persistence --model <m> --output-format json <prompt>`
   * run in `cwd`. With `resumeSessionId` it reads that whole conversation and leaves no transcript
   * behind and the source untouched (verified in docs/spike-004-context.md). Rejects with an
   * AbortError when `signal` fires; with ClaudeCliError (readable message) on any CLI failure.
   */
  async runPrompt(opts: RunPromptOptions): Promise<SummarizeResult> {
    const args = ['-p']
    if (opts.resumeSessionId) args.push('--resume', opts.resumeSessionId, '--fork-session')
    args.push(
      '--no-session-persistence',
      '--model',
      opts.model,
      '--output-format',
      'json',
      opts.prompt
    )
    const r = await this.runner(args, {
      cwd: opts.cwd,
      timeoutMs: opts.timeoutMs ?? 90_000,
      signal: opts.signal
    })
    const parsed = parsePrintJson(r.stdout, r.stderr)
    if (!parsed.ok) {
      const hint =
        /model/i.test(parsed.message) || /unrecognized_model/.test(r.stderr)
          ? ` Revisá la preferencia de modelo (ui.importContext.model = "${opts.model}").`
          : ''
      throw new ClaudeCliError(
        `No se pudo resumir la sesión (claude -p exit ${r.code}): ${parsed.message.replace(/\.$/, '')}.${hint}`,
        r
      )
    }
    return { text: parsed.text, raw: parsed }
  }

  /** Feature 004 wrapper kept for clarity: handoff summary of a live session. */
  async summarizeSession(opts: SummarizeOptions): Promise<SummarizeResult> {
    return this.runPrompt({
      resumeSessionId: opts.sessionId,
      cwd: opts.cwd,
      model: opts.model,
      prompt: opts.prompt,
      ...(opts.signal ? { signal: opts.signal } : {}),
      ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {})
    })
  }

  /** `claude mcp add --transport http <name> <url> -s user` (idempotent: re-add repairs a stale URL). */
  async mcpAdd(name: string, url: string): Promise<void> {
    await this.runner(['mcp', 'remove', name, '-s', 'user'], { timeoutMs: this.timeoutMs })
    const r = await this.runner(['mcp', 'add', '--transport', 'http', name, url, '-s', 'user'], {
      timeoutMs: this.timeoutMs
    })
    if (r.code !== 0)
      throw new ClaudeCliError(
        `claude mcp add failed (exit ${r.code}): ${(r.stderr || r.stdout).trim()}`,
        r
      )
  }

  /** `claude mcp get <name>`; registered=false on non-zero exit. */
  async mcpGet(name: string): Promise<{ registered: boolean; url?: string }> {
    const r = await this.runner(['mcp', 'get', name], { timeoutMs: this.timeoutMs })
    if (r.code !== 0) return { registered: false }
    const m = /(https?:\/\/\S+)/.exec(r.stdout)
    return m?.[1] ? { registered: true, url: m[1] } : { registered: true }
  }

  /** `claude mcp remove <name> -s user`; tolerant if absent. */
  async mcpRemove(name: string): Promise<void> {
    await this.runner(['mcp', 'remove', name, '-s', 'user'], { timeoutMs: this.timeoutMs })
  }

  /** Convenience: find the entry for a bg id in a fresh listing. */
  async findByBgId(bgId: string): Promise<AgentEntry | undefined> {
    const r = await this.listSessions({ all: true })
    return r.entries.find((e) => e.id === bgId)
  }
}
