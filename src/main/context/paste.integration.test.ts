// Integration (feature 004 FR-10): real node-pty + real `claude attach` on a real bg session.
// A bracketed-paste block written without '\r' must NOT create a user turn; a following '\r' must
// deliver the whole multi-line block as ONE user message. Replica of docs/spike-004-context.md §3.
import { mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bracketedPaste } from '@shared/paste'
import { ClaudeCli } from '../claude/claude-cli'
import { resolveEnv } from '../env/env-resolver'
import { nodePtySpawn, PtyManager } from '../pty/pty-manager'

let cli: ClaudeCli | null = null
let env: NodeJS.ProcessEnv = {}
let cwd = ''
let bgId: string | undefined
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const projectDir = (dir: string): string =>
  join(homedir(), '.claude', 'projects', dir.replace(/[/.]/g, '-'))

/** Non-meta user messages in the session transcript (as the CLI stores them). */
function userMessages(dir: string, sessionId: string): string[] {
  const file = join(projectDir(dir), `${sessionId}.jsonl`)
  let raw = ''
  try {
    raw = readFileSync(file, 'utf8')
  } catch {
    return []
  }
  const out: string[] = []
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    try {
      const j = JSON.parse(line) as {
        type?: string
        isMeta?: boolean
        message?: { content?: unknown }
      }
      if (j.type !== 'user' || j.isMeta) continue
      const c = j.message?.content
      if (typeof c === 'string') out.push(c)
      else if (Array.isArray(c))
        for (const part of c as Array<{ type?: string; text?: string }>)
          if (part.type === 'text' && part.text) out.push(part.text)
    } catch {
      /* partial line while the CLI writes */
    }
  }
  return out
}

beforeAll(async () => {
  const r = await resolveEnv()
  env = r.env
  if (r.claude.ok) cli = new ClaudeCli({ binaryPath: r.claude.binaryPath, env })
  cwd = realpathSync(mkdtempSync(join(tmpdir(), 'hydra-paste-it-')))
}, 20_000)

afterAll(async () => {
  if (cli && bgId) {
    await cli.stop(bgId)
    await cli.remove(bgId)
  }
  rmSync(cwd, { recursive: true, force: true })
  rmSync(projectDir(cwd), { recursive: true, force: true })
}, 30_000)

describe('bracketed paste into a live session (integration)', () => {
  it('does not submit without Enter; Enter delivers the multi-line block as one user message', async () => {
    if (!cli) return
    const { bgId: id } = await cli.spawnBackground({
      cwd,
      name: `hydra-paste-it-${Date.now() % 100000}`,
      settingsJson: JSON.stringify({ model: 'haiku' })
    })
    bgId = id
    const entry = await cli.findByBgId(id)
    const sessionId = entry?.sessionId
    expect(sessionId).toBeTruthy()
    if (!sessionId) return

    const m = new PtyManager(nodePtySpawn())
    let screen = ''
    m.on('data', (e) => (screen += e.data))
    m.open({
      ptyId: 'p1',
      file: cli.binaryPath,
      args: ['attach', id],
      cwd,
      env,
      cols: 120,
      rows: 40
    })
    const t0 = Date.now()
    while (!/❯|Try "|\? for shortcuts/.test(screen) && Date.now() - t0 < 30_000) await sleep(200)
    await sleep(1500)

    const block = [
      'Te comparto, como contexto de referencia, el resumen de otra sesión mía llamada "x".',
      '',
      '<imported-context session="x">',
      '## Objetivo',
      '- Probar el pegado: PELICANO-42',
      '## Pendientes',
      '- nada',
      '</imported-context>',
      'Respondé solo "ok".'
    ].join('\n')
    m.write('p1', bracketedPaste(block))
    await sleep(2500)
    expect(userMessages(cwd, sessionId)).toEqual([]) // nothing submitted

    m.write('p1', '\r')
    const t1 = Date.now()
    let msgs: string[] = []
    while (msgs.length === 0 && Date.now() - t1 < 30_000) {
      await sleep(500)
      msgs = userMessages(cwd, sessionId)
    }
    expect(msgs).toHaveLength(1)
    expect(msgs[0]).toBe(block)

    m.disposeAll()
    expect(readdirSync(projectDir(cwd)).filter((f) => f.endsWith('.jsonl'))).toEqual([
      `${sessionId}.jsonl`
    ])
  }, 120_000)
})
