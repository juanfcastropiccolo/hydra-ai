import { describe, expect, it } from 'vitest'
import { droppedPathText, quoteForShell, relativeForShell } from './paths'

describe('relativeForShell', () => {
  it('returns a relative path when inside the base dir', () => {
    expect(relativeForShell('/p/foo/src/index.ts', '/p/foo')).toBe('src/index.ts')
    expect(relativeForShell('/p/foo/src/index.ts', '/p/foo/')).toBe('src/index.ts')
  })
  it('returns "." for the base dir itself', () => {
    expect(relativeForShell('/p/foo', '/p/foo')).toBe('.')
  })
  it('returns the absolute path when outside (and does not match sibling prefixes)', () => {
    expect(relativeForShell('/p/bar/a.ts', '/p/foo')).toBe('/p/bar/a.ts')
    expect(relativeForShell('/p/foobar/a.ts', '/p/foo')).toBe('/p/foobar/a.ts')
  })
  it('normalises . and ..', () => {
    expect(relativeForShell('/p/foo/src/../lib/x.ts', '/p/foo/./')).toBe('lib/x.ts')
  })
  it('uses realpath on both sides (/var vs /private/var)', () => {
    const rp = (p: string): string => (p.startsWith('/var/') ? '/private' + p : p)
    expect(relativeForShell('/private/var/t/proj/a.ts', '/var/t/proj', rp)).toBe('a.ts')
    expect(relativeForShell('/var/t/proj/a.ts', '/private/var/t/proj', rp)).toBe('a.ts')
  })
  it('tolerates a realpath that throws', () => {
    expect(
      relativeForShell('/p/foo/a.ts', '/p/foo', () => {
        throw new Error('ENOENT')
      })
    ).toBe('a.ts')
  })
})

describe('quoteForShell', () => {
  it('leaves safe paths alone', () => {
    expect(quoteForShell('src/index.ts')).toBe('src/index.ts')
    expect(quoteForShell('/Users/u/.local/bin/claude')).toBe('/Users/u/.local/bin/claude')
    expect(quoteForShell('a-b_c.d@e:f+g,h=i%j^k')).toBe('a-b_c.d@e:f+g,h=i%j^k')
  })
  it('quotes spaces, accents, $ and glob chars', () => {
    expect(quoteForShell('mi carpeta/archivo.ts')).toBe("'mi carpeta/archivo.ts'")
    expect(quoteForShell('docs/diseño.png')).toBe("'docs/diseño.png'")
    expect(quoteForShell('$HOME/x')).toBe("'$HOME/x'")
    expect(quoteForShell('a*b?c')).toBe("'a*b?c'")
  })
  it('escapes embedded single quotes', () => {
    expect(quoteForShell("it's.md")).toBe(`'it'\\''s.md'`)
  })
  it('empty string', () => {
    expect(quoteForShell('')).toBe("''")
  })
})

describe('droppedPathText', () => {
  it('composes quote(relative) + space', () => {
    expect(droppedPathText('/p/foo/src/a b.ts', '/p/foo')).toBe("'src/a b.ts' ")
    expect(droppedPathText('/p/bar/x.ts', '/p/foo')).toBe('/p/bar/x.ts ')
  })
})
