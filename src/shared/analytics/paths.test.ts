import { describe, expect, it } from 'vitest'
import { projectKeyFor, shortenPath } from './paths'
import { isTempCwd } from './temp-paths'

describe('isTempCwd', () => {
  it('flags macOS temp locations and $TMPDIR, not normal folders', () => {
    expect(isTempCwd('/tmp/x')).toBe(true)
    expect(isTempCwd('/private/tmp/claude-501/foo')).toBe(true)
    expect(isTempCwd('/var/folders/ab/T/hydra-e2e-proj-1')).toBe(true)
    expect(isTempCwd('/private/var/folders/ab/T/x')).toBe(true)
    expect(isTempCwd('/tmp')).toBe(true)
    expect(isTempCwd('/tmpfoo/bar')).toBe(false)
    expect(isTempCwd('/Users/u/Documents/Personal/hydra-ai')).toBe(false)
    expect(isTempCwd('/Users/u/scratch/x', '/Users/u/scratch')).toBe(true)
    expect(isTempCwd('/var/folders/zz/T/x', '/private/var/folders/zz/T')).toBe(true)
  })
})

describe('shortenPath', () => {
  it('abbreviates with ~ and keeps the last two segments', () => {
    expect(shortenPath('/Users/u/Documents/Personal/foo', '/Users/u')).toBe('…/Personal/foo')
    expect(shortenPath('/Users/u/foo', '/Users/u')).toBe('~/foo')
    expect(shortenPath('/opt/x/y/z')).toBe('…/y/z')
    expect(shortenPath('/')).toBe('/')
  })
})

describe('projectKeyFor', () => {
  const projects = [
    { id: 'A', name: 'Hydra', path: '/Users/u/dev/hydra' },
    { id: 'B', name: 'Hydra sub', path: '/Users/u/dev/hydra/packages/sub' }
  ]
  it('picks the deepest registered project, tolerating /private and trailing slashes', () => {
    expect(projectKeyFor('/Users/u/dev/hydra/src', projects)).toEqual({
      key: 'A',
      label: 'Hydra',
      projectId: 'A'
    })
    expect(projectKeyFor('/Users/u/dev/hydra/packages/sub/x/', projects).key).toBe('B')
    expect(projectKeyFor('/private/Users/u/dev/hydra', projects).key).toBe('A')
    expect(projectKeyFor('/Users/u/dev/hydra-ai', projects)).toEqual({
      key: '/Users/u/dev/hydra-ai',
      label: '…/dev/hydra-ai',
      projectId: null
    })
    expect(projectKeyFor('/Users/u/other', projects, '/Users/u').label).toBe('~/other')
  })
})
