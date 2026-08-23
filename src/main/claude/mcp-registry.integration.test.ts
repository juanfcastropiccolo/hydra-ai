// Integration (006): register/inspect/remove the MCP server in the real Claude config (user scope).
// Uses a throwaway name and always cleans up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { resolveEnv } from '../env/env-resolver'
import { ClaudeCli } from './claude-cli'

let cli: ClaudeCli | null = null
const NAME = `hydra-know-it-${Date.now() % 100000}`

beforeAll(async () => {
  const r = await resolveEnv()
  if (r.claude.ok)
    cli = new ClaudeCli({ binaryPath: r.claude.binaryPath, env: r.env, defaultTimeoutMs: 30_000 })
}, 20_000)

afterAll(async () => {
  await cli?.mcpRemove(NAME)
}, 30_000)

describe('claude mcp add/get/remove (integration)', () => {
  it('round-trips a user-scope http server registration', async () => {
    if (!cli) return
    expect(await cli.mcpGet(NAME)).toEqual({ registered: false })
    await cli.mcpAdd(NAME, 'http://127.0.0.1:49999/mcp')
    const got = await cli.mcpGet(NAME)
    expect(got.registered).toBe(true)
    expect(got.url).toBe('http://127.0.0.1:49999/mcp')
    // re-add with a new port repairs the URL
    await cli.mcpAdd(NAME, 'http://127.0.0.1:50000/mcp')
    expect((await cli.mcpGet(NAME)).url).toBe('http://127.0.0.1:50000/mcp')
    await cli.mcpRemove(NAME)
    expect(await cli.mcpGet(NAME)).toEqual({ registered: false })
  }, 120_000)
})
