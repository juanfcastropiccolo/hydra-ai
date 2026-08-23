import { describe, expect, it } from 'vitest'
import type { Project } from '@shared/types'
import { buildProjectIndex, matchProject, normalisePath } from './project-match'

const P = (id: string, path: string): Project => ({ id, name: id, path, addedAt: '2026-08-23' })
// realpath stub: macOS-style /var → /private/var, identity otherwise
const rp = (p: string): string => (p.startsWith('/var/') ? '/private' + p : p)

describe('project-match', () => {
  it('normalises trailing slashes', () => {
    expect(normalisePath('/a/b/')).toBe('/a/b')
    expect(normalisePath('/')).toBe('/')
  })
  it('matches a session cwd to its project and nested cwds to the deepest project', () => {
    const idx = buildProjectIndex([P('root', '/Users/u/work'), P('sub', '/Users/u/work/api')], rp)
    expect(matchProject('/Users/u/work/web/src', idx, rp)).toBe('root')
    expect(matchProject('/Users/u/work/api/src', idx, rp)).toBe('sub')
    expect(matchProject('/Users/u/work', idx, rp)).toBe('root')
  })
  it('does not match sibling folders sharing a prefix', () => {
    const idx = buildProjectIndex([P('a', '/Users/u/app')], rp)
    expect(matchProject('/Users/u/app2/x', idx, rp)).toBeNull()
  })
  it('returns null when cwd is outside all projects', () => {
    const idx = buildProjectIndex([P('a', '/Users/u/app')], rp)
    expect(matchProject('/tmp/x', idx, rp)).toBeNull()
  })
  it('compares realpaths (CLI reports /private/var while the project was added as /var)', () => {
    const idx = buildProjectIndex([P('t', '/var/folders/x/proj')], rp)
    expect(matchProject('/private/var/folders/x/proj/sub', idx, rp)).toBe('t')
  })
  it('homonymous folders are distinct projects by path', () => {
    const idx = buildProjectIndex([P('one', '/Users/u/a/foo'), P('two', '/Users/u/b/foo')], rp)
    expect(matchProject('/Users/u/b/foo', idx, rp)).toBe('two')
  })
  it('keeps the declared path when realpath throws (folder missing)', () => {
    const idx = buildProjectIndex([P('m', '/gone')], () => {
      throw new Error('ENOENT')
    })
    expect(
      matchProject('/gone/x', idx, () => {
        throw new Error('ENOENT')
      })
    ).toBe('m')
  })
})
