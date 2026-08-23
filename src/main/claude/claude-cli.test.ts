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

describe('ClaudeCli.summarizeSession (unit, fake runner)', () => {
  const OK = JSON.stringify({ type: 'result', is_error: false, result: '## Objetivo\nX' })

  it('runs claude -p --resume --fork-session --no-session-persistence in the session cwd and returns the text', async () => {
    const runner = vi.fn<Runner>(async () => ({ stdout: OK, stderr: '', code: 0 }))
    const ctrl = new AbortController()
    const r = await cli(runner).summarizeSession({
      sessionId: 'sid-1',
      cwd: '/src/cwd',
      model: 'haiku',
      prompt: 'resumí',
      signal: ctrl.signal
    })
    expect(r.text).toBe('## Objetivo\nX')
    expect(runner).toHaveBeenCalledWith(
      [
        '-p',
        '--resume',
        'sid-1',
        '--fork-session',
        '--no-session-persistence',
        '--model',
        'haiku',
        '--output-format',
        'json',
        'resumí'
      ],
      { cwd: '/src/cwd', timeoutMs: 90_000, signal: ctrl.signal }
    )
  })

  it('throws a readable ClaudeCliError on non-zero exit / is_error, hinting at the model pref when relevant', async () => {
    const bad = JSON.stringify({
      is_error: true,
      result: "There's an issue with the selected model (nope). It may not exist"
    })
    const runner = vi.fn<Runner>(async () => ({
      stdout: bad,
      stderr: '[claude-code:unrecognized_model] {}',
      code: 1
    }))
    await expect(
      cli(runner).summarizeSession({ sessionId: 's', cwd: '/c', model: 'nope', prompt: 'p' })
    ).rejects.toThrow(/selected model \(nope\).*ui\.importContext\.model = "nope"/s)
    const runner2 = vi.fn<Runner>(async () => ({
      stdout: '',
      stderr: 'No conversation found with session ID: s',
      code: 1
    }))
    const err = await cli(runner2)
      .summarizeSession({ sessionId: 's', cwd: '/c', model: 'haiku', prompt: 'p' })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ClaudeCliError)
    expect((err as Error).message).toMatch(/exit 1\): No conversation found with session ID: s\.$/)
  })

  it('propagates the runner abort rejection untouched', async () => {
    const abort = new Error('aborted')
    abort.name = 'AbortError'
    const runner = vi.fn<Runner>(async () => {
      throw abort
    })
    await expect(
      cli(runner).summarizeSession({ sessionId: 's', cwd: '/c', model: 'haiku', prompt: 'p' })
    ).rejects.toBe(abort)
  })
})

describe('ClaudeCli.mcp* (unit, fake runner)', () => {
  it('add removes first then adds with http transport at user scope; failures throw readable', async () => {
    const calls: string[][] = []
    const runner = vi.fn<Runner>(async (args) => {
      calls.push(args)
      return { stdout: 'ok', stderr: '', code: 0 }
    })
    await cli(runner).mcpAdd('hydra-know', 'http://127.0.0.1:4855/mcp')
    expect(calls).toEqual([
      ['mcp', 'remove', 'hydra-know', '-s', 'user'],
      ['mcp', 'add', '--transport', 'http', 'hydra-know', 'http://127.0.0.1:4855/mcp', '-s', 'user']
    ])
    const failing = vi.fn<Runner>(async (args) =>
      args[1] === 'add'
        ? { stdout: '', stderr: 'boom', code: 1 }
        : { stdout: '', stderr: '', code: 0 }
    )
    await expect(cli(failing).mcpAdd('x', 'http://u')).rejects.toThrow(/mcp add failed.*boom/s)
  })
  it('get parses the URL and reports unregistered on failure; remove is tolerant', async () => {
    const runner = vi.fn<Runner>(async (args) =>
      args[1] === 'get'
        ? {
            stdout: 'hydra-know:\n  URL: http://127.0.0.1:4855/mcp\n  Status: connected',
            stderr: '',
            code: 0
          }
        : { stdout: '', stderr: '', code: 0 }
    )
    expect(await cli(runner).mcpGet('hydra-know')).toEqual({
      registered: true,
      url: 'http://127.0.0.1:4855/mcp'
    })
    const missing = vi.fn<Runner>(async () => ({
      stdout: '',
      stderr: 'No MCP server found',
      code: 1
    }))
    expect(await cli(missing).mcpGet('nope')).toEqual({ registered: false })
    await cli(runner).mcpRemove('hydra-know')
  })
})
