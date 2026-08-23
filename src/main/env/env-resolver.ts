// EnvResolver: GUI apps launched from Finder/Dock do NOT inherit the user's shell PATH
// (only /usr/bin:/bin:/usr/sbin:/sbin). Claude Code's installer puts `claude` in ~/.local/bin,
// so a packaged Hydra would never find it without this. We ask the user's *login* shell for
// its PATH (non-interactive: `-lc`, because `-ilc` hung on the author's machine — see
// docs/spike-001-attach.md) and always add well-known fallbacks.
import { execFile } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ClaudeAvailability } from '@shared/types'

export const SHELL_PATH_TIMEOUT_MS = 3000
const INSTALL_HINT =
  'Instalá Claude Code con: curl -fsSL https://claude.ai/install.sh | bash — o verificá que `claude` esté en tu PATH o en ~/.local/bin.'

/** Pure: parse stdout of `$SHELL -lc 'echo $PATH'`, tolerating noisy rc files. */
export function parseShellPath(stdout: string | undefined): string[] {
  if (!stdout) return []
  const lines = stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  // Take the last line that looks like a PATH (contains a slash); rc files may print banners first.
  const candidate = [...lines].reverse().find((l) => l.includes('/')) ?? ''
  return candidate.split(':').filter(Boolean)
}

/** Pure: compose the PATH Hydra uses for every child process and PTY. */
export function buildPath(parts: {
  shellPath: string[]
  home: string
  processPath: string
}): string {
  const fallbacks = [join(parts.home, '.local/bin'), '/usr/local/bin', '/opt/homebrew/bin']
  const all = [...parts.shellPath, ...fallbacks, ...parts.processPath.split(':')].filter(Boolean)
  return Array.from(new Set(all)).join(':')
}

/** Pure (injectable fs check): locate the `claude` executable. */
export function findClaudeBinary(opts: {
  home: string
  path: string
  isExecutable: (p: string) => boolean
}): ClaudeAvailability {
  const preferred = join(opts.home, '.local/bin/claude')
  const candidates = [
    preferred,
    ...opts.path
      .split(':')
      .filter(Boolean)
      .map((d) => join(d, 'claude'))
  ]
  const hit = candidates.find((c) => opts.isExecutable(c))
  if (hit) return { ok: true, binaryPath: hit }
  return {
    ok: false,
    reason: 'not-found',
    message: 'No se encontró el ejecutable `claude` de Claude Code en esta máquina.',
    hint: INSTALL_HINT
  }
}

/** Pure: build the env for child processes / PTYs. */
export function resolveEnvFromParts(opts: {
  base: NodeJS.ProcessEnv
  path: string
}): NodeJS.ProcessEnv {
  return {
    ...opts.base,
    PATH: opts.path,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    LANG: opts.base.LANG ?? 'en_US.UTF-8'
  }
}

function readLoginShellPath(
  shell: string,
  timeoutMs: number,
  env: NodeJS.ProcessEnv
): Promise<string[]> {
  return new Promise((resolve) => {
    execFile(
      shell,
      ['-lc', 'echo "$PATH"'],
      { timeout: timeoutMs, encoding: 'utf8', env },
      (err, stdout) => {
        resolve(err ? [] : parseShellPath(stdout))
      }
    )
  })
}

export interface ResolvedEnv {
  env: NodeJS.ProcessEnv
  claude: ClaudeAvailability
  shellPathRead: boolean
}

/** Effectful entry point used by main at startup. */
export async function resolveEnv(
  opts: { shell?: string; timeoutMs?: number; base?: NodeJS.ProcessEnv; home?: string } = {}
): Promise<ResolvedEnv> {
  const base = opts.base ?? process.env
  const home = opts.home ?? homedir()
  const shell = opts.shell ?? base.SHELL ?? '/bin/zsh'
  const shellPath = await readLoginShellPath(shell, opts.timeoutMs ?? SHELL_PATH_TIMEOUT_MS, base)
  const path = buildPath({ shellPath, home, processPath: base.PATH ?? '' })
  const env = resolveEnvFromParts({ base, path })
  const claude = findClaudeBinary({
    home,
    path,
    isExecutable: (p) => {
      try {
        accessSync(p, constants.X_OK)
        return true
      } catch {
        return false
      }
    }
  })
  return { env, claude, shellPathRead: shellPath.length > 0 }
}
