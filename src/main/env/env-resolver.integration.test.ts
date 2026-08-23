// Integration: real login shell + real filesystem on this machine. Requires `claude` installed.
import { describe, expect, it } from 'vitest'
import { resolveEnv } from './env-resolver'

describe('resolveEnv (integration)', () => {
  it('finds the real claude binary even when the process env PATH is minimal (Finder-like)', async () => {
    const r = await resolveEnv({ base: { ...process.env, PATH: '/usr/bin:/bin:/usr/sbin:/sbin' } })
    expect(r.claude.ok).toBe(true)
    if (r.claude.ok) expect(r.claude.binaryPath).toMatch(/claude$/)
    expect(r.env.PATH).toContain('.local/bin')
  }, 15_000)

  it('reports not-found with an actionable hint when PATH and home have no claude', async () => {
    const r = await resolveEnv({
      base: { PATH: '/nonexistent', SHELL: '/bin/sh' },
      home: '/nonexistent-home',
      timeoutMs: 2000
    })
    expect(r.claude.ok).toBe(false)
    if (!r.claude.ok) expect(r.claude.hint).toMatch(/install\.sh/)
  }, 10_000)
})
