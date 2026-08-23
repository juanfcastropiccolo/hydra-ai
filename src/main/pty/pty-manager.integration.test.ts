// Integration: real node-pty + real `claude attach` on a real background session.
// Verifies (a) bytes flow from the attached TUI, (b) disposeAll kills only the client:
// the session is still listed afterwards (AC-12 at the main-process level).
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ClaudeCli } from '../claude/claude-cli'
import { resolveEnv } from '../env/env-resolver'
import { nodePtySpawn, PtyManager } from './pty-manager'

let cli: ClaudeCli | null = null
let env: NodeJS.ProcessEnv = {}
let cwd = ''
let bgId: string | undefined

beforeAll(async () => {
  const r = await resolveEnv()
  env = r.env
  if (r.claude.ok) cli = new ClaudeCli({ binaryPath: r.claude.binaryPath, env })
  cwd = realpathSync(mkdtempSync(join(tmpdir(), 'hydra-pty-it-')))
}, 20_000)

afterAll(async () => {
  if (cli && bgId) {
    await cli.stop(bgId)
    await cli.remove(bgId)
  }
  rmSync(cwd, { recursive: true, force: true })
}, 30_000)

describe('PtyManager (integration)', () => {
  it('attaches to a real bg session, receives bytes, and disposeAll leaves the session alive', async () => {
    if (!cli) return
    const { bgId: id } = await cli.spawnBackground({
      cwd,
      name: `hydra-pty-it-${Date.now() % 100000}`
    })
    bgId = id
    const m = new PtyManager(nodePtySpawn())
    let received = ''
    m.on('data', (e) => (received += e.data))
    m.open({
      ptyId: 'p1',
      file: cli.binaryPath,
      args: ['attach', id],
      cwd,
      env,
      cols: 100,
      rows: 30
    })
    const t0 = Date.now()
    while (received.length < 200 && Date.now() - t0 < 20_000)
      await new Promise((r) => setTimeout(r, 100))
    expect(received.length).toBeGreaterThan(0)
    expect(m.scrollback('p1')).toBe(received)

    m.disposeAll()
    await new Promise((r) => setTimeout(r, 500))
    const still = await cli.findByBgId(id)
    expect(still).toBeDefined()
    expect(still?.kind).toBe('background')
  }, 60_000)
})
