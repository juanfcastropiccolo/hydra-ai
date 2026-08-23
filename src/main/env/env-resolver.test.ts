import { describe, expect, it } from 'vitest'
import { buildPath, findClaudeBinary, parseShellPath, resolveEnvFromParts } from './env-resolver'

describe('parseShellPath', () => {
  it('trims whitespace/newlines and drops empty entries', () => {
    expect(parseShellPath('  /a/bin:/b/bin:\n')).toEqual(['/a/bin', '/b/bin'])
  })
  it('returns [] for empty or undefined output', () => {
    expect(parseShellPath('')).toEqual([])
    expect(parseShellPath(undefined)).toEqual([])
  })
  it('ignores garbage lines printed by noisy rc files, keeping the last PATH-looking line', () => {
    const out = 'Welcome!\nLoading plugins…\n/usr/local/bin:/usr/bin\n'
    expect(parseShellPath(out)).toEqual(['/usr/local/bin', '/usr/bin'])
  })
})

describe('buildPath', () => {
  it('puts shell PATH first, then well-known fallbacks, then process PATH, deduplicated', () => {
    const p = buildPath({
      shellPath: ['/shell/bin', '/usr/bin'],
      home: '/Users/u',
      processPath: '/usr/bin:/bin'
    })
    expect(p.split(':')).toEqual([
      '/shell/bin',
      '/usr/bin',
      '/Users/u/.local/bin',
      '/usr/local/bin',
      '/opt/homebrew/bin',
      '/bin'
    ])
  })
  it('still yields fallbacks when the shell PATH could not be read', () => {
    const p = buildPath({ shellPath: [], home: '/Users/u', processPath: '' })
    expect(p.split(':')).toContain('/Users/u/.local/bin')
  })
})

describe('findClaudeBinary', () => {
  const exec = (okPaths: string[]) => (p: string) => okPaths.includes(p)
  it('prefers ~/.local/bin/claude (the official installer location)', () => {
    const r = findClaudeBinary({
      home: '/Users/u',
      path: '/x/bin:/Users/u/.local/bin',
      isExecutable: exec(['/x/bin/claude', '/Users/u/.local/bin/claude'])
    })
    expect(r).toEqual({ ok: true, binaryPath: '/Users/u/.local/bin/claude' })
  })
  it('falls back to the first PATH hit', () => {
    const r = findClaudeBinary({
      home: '/Users/u',
      path: '/x/bin:/y/bin',
      isExecutable: exec(['/y/bin/claude'])
    })
    expect(r).toEqual({ ok: true, binaryPath: '/y/bin/claude' })
  })
  it('returns an actionable not-found error', () => {
    const r = findClaudeBinary({ home: '/Users/u', path: '/x/bin', isExecutable: () => false })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('not-found')
      expect(r.hint).toMatch(/curl -fsSL https:\/\/claude\.ai\/install\.sh/)
    }
  })
})

describe('resolveEnvFromParts', () => {
  it('produces an env with PATH, TERM and COLORTERM suitable for PTYs', () => {
    const env = resolveEnvFromParts({
      base: { HOME: '/Users/u', LANG: 'es_AR.UTF-8' },
      path: '/a:/b'
    })
    expect(env.PATH).toBe('/a:/b')
    expect(env.TERM).toBe('xterm-256color')
    expect(env.COLORTERM).toBe('truecolor')
    expect(env.LANG).toBe('es_AR.UTF-8')
    expect(env.HOME).toBe('/Users/u')
  })
  it('defaults LANG to a UTF-8 locale when missing (Finder launches have none)', () => {
    expect(resolveEnvFromParts({ base: {}, path: '/a' }).LANG).toBe('en_US.UTF-8')
  })
})
