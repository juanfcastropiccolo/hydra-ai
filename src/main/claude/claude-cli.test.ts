import { describe, expect, it, vi } from 'vitest'
import { ClaudeCli, ClaudeCliError, parseBackgroundedLine, type Runner } from './claude-cli'

const SPAWN_OUT = `Starting background service…
backgrounded · 7fd3402f · hydra-probe-noprompt (idle — send a prompt to start)
  claude agents             list sessions
  claude attach 7fd3402f    open in this terminal
`

describe('parseBackgroundedLine', () => {
  it('extracts id and name from the real --bg output', () => {
    expect(parseBackgroundedLine(SPAWN_OUT)).toEqual({
      id: '7fd3402f',
      name: 'hydra-probe-noprompt'
    })
  })
  it('handles the line without a name or parenthetical', () => {
    expect(parseBackgroundedLine('backgrounded · abc12345\n')).toEqual({ id: 'abc12345' })
  })
  it('returns null when absent', () => {
    expect(parseBackgroundedLine('something went wrong')).toBeNull()
  })
})

function cli(runner: Runner): ClaudeCli {
  return new ClaudeCli({ binaryPath: '/fake/claude', env: {}, runner })
}

describe('ClaudeCli (unit, fake runner)', () => {
  it('spawnBackground passes cwd, name and settings, returns bgId', async () => {
    const runner = vi.fn<Runner>(async () => ({ stdout: SPAWN_OUT, stderr: '', code: 0 }))
    const r = await cli(runner).spawnBackground({
      cwd: '/p',
      name: 'foo-1',
      settingsJson: '{"hooks":{}}'
    })
    expect(r).toEqual({ bgId: '7fd3402f' })
    expect(runner).toHaveBeenCalledWith(
      ['--bg', '--name', 'foo-1', '--settings', '{"hooks":{}}'],
      expect.objectContaining({ cwd: '/p' })
    )
  })
  it('spawnBackground throws ClaudeCliError on failure', async () => {
    const runner: Runner = async () => ({ stdout: '', stderr: 'boom', code: 1 })
    await expect(cli(runner).spawnBackground({ cwd: '/p', name: 'x' })).rejects.toBeInstanceOf(
      ClaudeCliError
    )
  })
  it('listSessions builds flags and parses output; non-zero exit → error, no throw', async () => {
    const runner = vi.fn<Runner>(async (args) =>
      args.includes('--all')
        ? {
            stdout: '[{"cwd":"/a","kind":"interactive","startedAt":1,"status":"idle","pid":5}]',
            stderr: '',
            code: 0
          }
        : { stdout: '', stderr: 'daemon down', code: 2 }
    )
    const c = cli(runner)
    const ok = await c.listSessions({ all: true, cwd: '/a' })
    expect(ok.entries).toHaveLength(1)
    expect(runner).toHaveBeenLastCalledWith(
      ['agents', '--json', '--all', '--cwd', '/a'],
      expect.anything()
    )
    const bad = await c.listSessions()
    expect(bad.entries).toEqual([])
    expect(bad.error).toMatch(/daemon down/)
  })
  it('stop/remove call the right subcommands', async () => {
    const runner = vi.fn<Runner>(async () => ({ stdout: '', stderr: '', code: 0 }))
    const c = cli(runner)
    await c.stop('abc')
    await c.remove('abc')
    expect(runner.mock.calls.map((c) => c[0])).toEqual([
      ['stop', 'abc'],
      ['rm', 'abc']
    ])
  })
})
