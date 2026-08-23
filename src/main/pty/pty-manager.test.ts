import { describe, expect, it, vi } from 'vitest'
import { PtyManager, type PtyProcess, type PtySpawn } from './pty-manager'

function fakePty(): PtyProcess & { emitData(d: string): void; emitExit(code: number): void } {
  let onData: (d: string) => void = () => {}
  let onExit: (e: { exitCode: number }) => void = () => {}
  return {
    pid: 123,
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: (cb) => {
      onData = cb
      return { dispose: () => {} }
    },
    onExit: (cb) => {
      onExit = cb
      return { dispose: () => {} }
    },
    emitData: (d) => onData(d),
    emitExit: (c) => onExit({ exitCode: c })
  }
}

const req = (
  ptyId: string
): {
  ptyId: string
  file: string
  args: string[]
  cwd: string
  env: NodeJS.ProcessEnv
  cols: number
  rows: number
} => ({
  ptyId,
  file: '/bin/claude',
  args: ['attach', 'x'],
  cwd: '/p',
  env: {},
  cols: 80,
  rows: 24
})

describe('PtyManager', () => {
  it('opens with spawn args, forwards data/exit events, writes and resizes', () => {
    const p = fakePty()
    const spawn = vi.fn<PtySpawn>(() => p)
    const m = new PtyManager(spawn)
    const data: string[] = []
    const exits: number[] = []
    m.on('data', (e) => data.push(e.data))
    m.on('exit', (e) => exits.push(e.exitCode))
    m.open(req('a'))
    expect(spawn).toHaveBeenCalledWith(
      '/bin/claude',
      ['attach', 'x'],
      expect.objectContaining({ cols: 80, rows: 24, cwd: '/p', name: 'xterm-256color' })
    )
    p.emitData('hello')
    m.write('a', 'y\r')
    m.resize('a', 120.7, 40)
    expect(data).toEqual(['hello'])
    expect(p.write).toHaveBeenCalledWith('y\r')
    expect(p.resize).toHaveBeenCalledWith(120, 40)
    p.emitExit(0)
    expect(exits).toEqual([0])
    // after exit, writes/resizes are dropped silently
    m.write('a', 'z')
    expect(p.write).toHaveBeenCalledTimes(1)
  })
  it('rejects duplicate ids and ignores unknown ids', () => {
    const m = new PtyManager(() => fakePty())
    m.open(req('a'))
    expect(() => m.open(req('a'))).toThrow(/already open/)
    expect(() => m.write('nope', 'x')).not.toThrow()
    expect(() => m.resize('nope', 1, 1)).not.toThrow()
    expect(() => m.close('nope')).not.toThrow()
  })
  it('ignores absurd sizes', () => {
    const p = fakePty()
    const m = new PtyManager(() => p)
    m.open(req('a'))
    m.resize('a', 0, 0)
    m.resize('a', NaN, 10)
    expect(p.resize).not.toHaveBeenCalled()
  })
  it('keeps a bounded scrollback buffer', () => {
    const p = fakePty()
    const m = new PtyManager(() => p, 10)
    m.open(req('a'))
    p.emitData('12345')
    p.emitData('67890')
    p.emitData('abc')
    expect(m.scrollback('a')).toBe('67890abc')
    expect(m.scrollback('zzz')).toBe('')
  })
  it('close kills the client; disposeAll kills all and forgets them', () => {
    const a = fakePty()
    const b = fakePty()
    const procs = [a, b]
    const m = new PtyManager(() => procs.shift()!)
    m.open(req('a'))
    m.open(req('b'))
    m.close('a')
    expect(a.kill).toHaveBeenCalled()
    expect(m.has('a')).toBe(false)
    m.disposeAll()
    expect(b.kill).toHaveBeenCalled()
    expect(m.has('b')).toBe(false)
  })
  it('does not kill a process that already exited', () => {
    const p = fakePty()
    const m = new PtyManager(() => p)
    m.open(req('a'))
    p.emitExit(1)
    m.close('a')
    expect(p.kill).not.toHaveBeenCalled()
  })
})
