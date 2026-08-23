import { describe, expect, it, vi } from 'vitest'
import { GitService, rootInCallerForm } from './git-service'

const ok = (s: string): { code: number; stdout: Buffer; stderr: string } => ({
  code: 0,
  stdout: Buffer.from(s),
  stderr: ''
})

describe('GitService (unit, fake runner)', () => {
  it('resolves root once (cached) and parses status; coalesces concurrent calls', async () => {
    const runner = vi.fn(async (args: string[]) => {
      if (args[0] === 'rev-parse') return ok('/repo\n')
      await new Promise((r) => setTimeout(r, 20))
      return ok(' M a.ts\0?? b.ts\0')
    })
    const g = new GitService({ env: {}, runner })
    const [a, b] = await Promise.all([g.status('/repo/sub'), g.status('/repo/sub')])
    expect(a).toEqual({ root: '/repo', statuses: { 'a.ts': 'modified', 'b.ts': 'untracked' } })
    expect(b).toBe(a)
    expect(runner.mock.calls.filter((c) => c[0][0] === 'status')).toHaveLength(1)
    await g.status('/repo/sub')
    expect(runner.mock.calls.filter((c) => c[0][0] === 'rev-parse')).toHaveLength(1)
  })
  it('not a repo → root null, no statuses; git failure → empty statuses', async () => {
    const g = new GitService({
      env: {},
      runner: async () => ({
        code: 128,
        stdout: Buffer.from(''),
        stderr: 'fatal: not a git repository'
      })
    })
    expect(await g.status('/x')).toEqual({ root: null, statuses: {} })
    const g2 = new GitService({
      env: {},
      runner: async (args) =>
        args[0] === 'rev-parse' ? ok('/r\n') : { code: 1, stdout: Buffer.from(''), stderr: 'boom' }
    })
    expect(await g2.status('/r')).toEqual({ root: '/r', statuses: {} })
  })
  it('runner throwing (git missing) → never throws', async () => {
    const g = new GitService({
      env: {},
      runner: async () => {
        throw new Error('ENOENT')
      }
    })
    expect(await g.status('/x')).toEqual({ root: null, statuses: {} })
  })
})

describe('rootInCallerForm', () => {
  it('maps a realpath root back into the symlinked form the caller used', () => {
    expect(
      rootInCallerForm('/var/t/proj/src', '/private/var/t/proj/src', '/private/var/t/proj')
    ).toBe('/var/t/proj')
    expect(rootInCallerForm('/var/t/proj', '/private/var/t/proj', '/private/var/t/proj')).toBe(
      '/var/t/proj'
    )
  })
  it('keeps the git root when forms do not line up', () => {
    expect(rootInCallerForm('/x/y', '/x/y', '/x')).toBe('/x')
    expect(rootInCallerForm('/elsewhere', '/real/other', '/real')).toBe('/real')
  })
  it('GitService uses it (fake runner + realpath)', async () => {
    const g = new GitService({
      env: {},
      realpath: (p) => p.replace(/^\/var\//, '/private/var/'),
      runner: async (args) =>
        args[0] === 'rev-parse' ? ok('/private/var/t/proj\n') : ok(' M a.ts\0')
    })
    expect(await g.status('/var/t/proj/sub')).toEqual({
      root: '/var/t/proj',
      statuses: { 'a.ts': 'modified' }
    })
  })
})
