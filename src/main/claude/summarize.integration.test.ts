// Integration (feature 004): real `claude` CLI. Creates a tiny print-mode session with a planted
// fact, then summarises it through ClaudeCli.summarizeSession and checks that no transcript was
// added and the source transcript is untouched. Costs a few cents (haiku). Skipped without claude.
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, readdirSync, realpathSync, rmSync, statSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildHandoffPrompt } from '../context/handoff-prompt'
import { resolveEnv } from '../env/env-resolver'
import { ClaudeCli } from './claude-cli'

const run = promisify(execFile)
let cli: ClaudeCli | null = null
let env: NodeJS.ProcessEnv = {}
let cwd = ''
const projectDir = (dir: string): string =>
  join(homedir(), '.claude', 'projects', dir.replace(/[/.]/g, '-'))
const transcripts = (dir: string): string[] => {
  try {
    return readdirSync(projectDir(dir)).filter((f) => f.endsWith('.jsonl'))
  } catch {
    return []
  }
}

beforeAll(async () => {
  const r = await resolveEnv()
  if (r.claude.ok) {
    cli = new ClaudeCli({ binaryPath: r.claude.binaryPath, env: r.env })
    env = r.env
  }
  cwd = realpathSync(mkdtempSync(join(tmpdir(), 'hydra-sum-it-')))
}, 20_000)

afterAll(() => {
  rmSync(cwd, { recursive: true, force: true })
  rmSync(projectDir(cwd), { recursive: true, force: true })
})

describe('ClaudeCli.summarizeSession (integration)', () => {
  it('summarises a session with a planted fact, adds no transcript and leaves the source untouched', async () => {
    if (!cli) return
    const sessionId = randomUUID()
    await run(
      cli.binaryPath,
      [
        '-p',
        '--session-id',
        sessionId,
        '--model',
        'haiku',
        'Contexto de trabajo: estamos migrando el módulo de pagos a la API v3; la rama se llama feature/pagos-v3 y el ticket es PAY-1234. Respondé solo "ok".'
      ],
      { cwd, env, timeout: 120_000 }
    )
    const before = transcripts(cwd)
    expect(before).toContain(`${sessionId}.jsonl`)
    const srcSize = statSync(join(projectDir(cwd), `${sessionId}.jsonl`)).size

    const r = await cli.summarizeSession({
      sessionId,
      cwd,
      model: 'haiku',
      prompt: buildHandoffPrompt()
    })
    expect(r.text).toMatch(/PAY-1234/)
    expect(r.text).toMatch(/pagos-v3/)
    expect(r.text).toMatch(/##\s*Objetivo/i)

    expect(transcripts(cwd)).toEqual(before) // no forked transcript
    expect(statSync(join(projectDir(cwd), `${sessionId}.jsonl`)).size).toBe(srcSize)
  }, 180_000)

  it('aborts promptly when the signal fires', async () => {
    if (!cli) return
    const ctrl = new AbortController()
    const t0 = Date.now()
    const p = cli.summarizeSession({
      sessionId: randomUUID(), // any id: we abort before the CLI gets anywhere
      cwd,
      model: 'haiku',
      prompt: 'x',
      signal: ctrl.signal
    })
    setTimeout(() => ctrl.abort(), 500)
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
    expect(Date.now() - t0).toBeLessThan(3000)
  }, 20_000)
})
