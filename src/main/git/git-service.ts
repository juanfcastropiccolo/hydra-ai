// GitService: repo root + working-tree status via the real `git` CLI (feature 002).
// One status run in flight per root; callers coalesce via refresh() debounce.
import { execFile } from 'node:child_process'
import { realpathSync } from 'node:fs'
import type { GitStatusResult } from '@shared/types'
import { parseGitPorcelain } from './porcelain'

export interface GitServiceOptions {
  env: NodeJS.ProcessEnv
  timeoutMs?: number
  /** Injectable runner for unit tests. */
  runner?: (
    args: string[],
    cwd: string
  ) => Promise<{ code: number; stdout: Buffer; stderr: string }>
  /** Injectable realpath (tests). */
  realpath?: (p: string) => string
}

/**
 * git prints the toplevel as a realpath (/private/var/… on macOS) while callers may hold the
 * symlinked form (/var/…). Express the root in the caller's form so path prefixes line up.
 */
export function rootInCallerForm(dir: string, realDir: string, root: string): string {
  const suffix = realDir.startsWith(root) ? realDir.slice(root.length) : null
  if (suffix !== null && dir.endsWith(suffix))
    return dir.slice(0, dir.length - suffix.length) || '/'
  return root
}

export class GitService {
  private readonly timeoutMs: number
  private readonly runner: NonNullable<GitServiceOptions['runner']>
  private inflight = new Map<string, Promise<GitStatusResult>>()
  private rootCache = new Map<string, Promise<string | null>>()
  private readonly realpath: (p: string) => string

  constructor(private readonly opts: GitServiceOptions) {
    this.timeoutMs = opts.timeoutMs ?? 5000
    this.realpath = opts.realpath ?? ((p) => realpathSync(p))
    this.runner = opts.runner ?? this.defaultRunner
  }

  private defaultRunner = (
    args: string[],
    cwd: string
  ): Promise<{ code: number; stdout: Buffer; stderr: string }> =>
    new Promise((resolve) => {
      execFile(
        'git',
        args,
        {
          cwd,
          env: this.opts.env,
          timeout: this.timeoutMs,
          encoding: 'buffer',
          maxBuffer: 64 * 1024 * 1024
        },
        (err, stdout, stderr) => {
          const code = err
            ? (((err as NodeJS.ErrnoException & { code?: unknown }).code as number | undefined) ??
              1)
            : 0
          resolve({
            code: typeof code === 'number' ? code : 1,
            stdout: Buffer.from(stdout ?? ''),
            stderr: String(stderr ?? '')
          })
        }
      )
    })

  /** Toplevel of the repo containing `dir`, or null (not a repo / git missing). Cached per dir. */
  root(dir: string): Promise<string | null> {
    const cached = this.rootCache.get(dir)
    if (cached) return cached
    const p = (async (): Promise<string | null> => {
      try {
        const r = await this.runner(['rev-parse', '--show-toplevel'], dir)
        const root = r.code === 0 ? r.stdout.toString('utf8').trim() || null : null
        if (!root) return null
        let realDir = dir
        try {
          realDir = this.realpath(dir)
        } catch {
          /* keep */
        }
        return rootInCallerForm(dir.replace(/\/+$/, ''), realDir, root)
      } catch {
        return null
      }
    })()
    this.rootCache.set(dir, p)
    return p
  }

  invalidateRoot(dir: string): void {
    this.rootCache.delete(dir)
  }

  /** Status of the repo containing `dir`. Never throws: errors → { root, statuses: {} }. */
  status(dir: string): Promise<GitStatusResult> {
    const byDir = this.inflight.get('dir:' + dir)
    if (byDir) return byDir
    const p = (async (): Promise<GitStatusResult> => {
      const root = await this.root(dir)
      if (!root) return { root: null, statuses: {} }
      const existing = this.inflight.get(root)
      if (existing) return existing
      const run = this.runStatus(root)
      this.inflight.set(root, run)
      return run
    })().finally(() => this.inflight.delete('dir:' + dir))
    this.inflight.set('dir:' + dir, p)
    return p
  }

  private runStatus(root: string): Promise<GitStatusResult> {
    return (async (): Promise<GitStatusResult> => {
      try {
        const r = await this.runner(
          ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignored=matching'],
          root
        )
        if (r.code !== 0) return { root, statuses: {} }
        return { root, statuses: parseGitPorcelain(r.stdout) }
      } catch {
        return { root, statuses: {} }
      } finally {
        this.inflight.delete(root)
      }
    })()
  }
}
