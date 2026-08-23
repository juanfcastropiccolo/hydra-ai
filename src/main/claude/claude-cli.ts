// Thin, typed wrapper over the public `claude` CLI. Every subprocess Hydra runs against
// Claude Code goes through here, so the contract (flags, output formats) lives in one place.
import { execFile } from 'node:child_process'
import { parseAgentsJson, type AgentEntry, type ParseAgentsResult } from './agents-json'

export interface ExecResult {
  stdout: string
  stderr: string
  code: number
}

/** Injectable runner so unit tests never spawn processes. */
export type Runner = (
  args: string[],
  opts: { cwd?: string; timeoutMs: number }
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

export class ClaudeCli {
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

  private defaultRunner: Runner = (args, { cwd, timeoutMs }) =>
    new Promise((resolve) => {
      execFile(
        this.opts.binaryPath,
        args,
        {
          cwd,
          env: this.opts.env,
          timeout: timeoutMs,
          encoding: 'utf8',
          maxBuffer: 8 * 1024 * 1024
        },
        (err, stdout, stderr) => {
          const code =
            err && typeof (err as NodeJS.ErrnoException & { code?: unknown }).code === 'number'
              ? (err as { code: number }).code
              : err
                ? 1
                : 0
          resolve({ stdout: String(stdout ?? ''), stderr: String(stderr ?? ''), code })
        }
      )
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

  /** Convenience: find the entry for a bg id in a fresh listing. */
  async findByBgId(bgId: string): Promise<AgentEntry | undefined> {
    const r = await this.listSessions({ all: true })
    return r.entries.find((e) => e.id === bgId)
  }
}
