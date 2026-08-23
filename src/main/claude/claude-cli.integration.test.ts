// Integration: talks to the real `claude` CLI on this machine. Creates and removes a real
// background session in a temp dir. Skipped automatically if claude is not found.
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { resolveEnv } from '../env/env-resolver'
import { ClaudeCli } from './claude-cli'

let cli: ClaudeCli | null = null
let cwd = ''
let bgId: string | undefined

beforeAll(async () => {
  const r = await resolveEnv()
  if (r.claude.ok) cli = new ClaudeCli({ binaryPath: r.claude.binaryPath, env: r.env })
  // The CLI reports realpath cwds (/private/var/… on macOS), so normalise ours too.
  cwd = realpathSync(mkdtempSync(join(tmpdir(), 'hydra-cli-it-')))
}, 20_000)

afterAll(async () => {
  if (cli && bgId) {
    await cli.stop(bgId)
    await cli.remove(bgId)
  }
  rmSync(cwd, { recursive: true, force: true })
}, 30_000)

describe('ClaudeCli (integration)', () => {
  it('reports a version', async () => {
    if (!cli) return
    expect(await cli.version()).toMatch(/\d+\.\d+\.\d+/)
  }, 15_000)

  it('spawns a background session without prompt, lists it with id/kind, then stops+removes it', async () => {
    if (!cli) return
    const name = `hydra-it-${Date.now() % 100000}`
    const r = await cli.spawnBackground({ cwd, name })
    bgId = r.bgId
    expect(bgId).toMatch(/^[0-9a-f]{6,}$/)

    const found = await cli.findByBgId(bgId)
    expect(found).toBeDefined()
    expect(found).toMatchObject({ kind: 'background', id: bgId, name, cwd })
    expect(found?.sessionId).toMatch(/^[0-9a-f-]{36}$/)

    await cli.stop(bgId)
    await cli.remove(bgId)
    const gone = await cli.findByBgId(bgId)
    expect(gone).toBeUndefined()
    bgId = undefined
  }, 60_000)
})
