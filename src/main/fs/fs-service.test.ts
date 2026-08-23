import { describe, expect, it } from 'vitest'
import type { FsEntry } from '@shared/types'
import { coalesceWatchEvents, sortEntries } from './fs-service'

describe('sortEntries', () => {
  it('folders first, then files, case-insensitive, numeric-aware', () => {
    const e: FsEntry[] = [
      { name: 'zeta.ts', kind: 'file' },
      { name: 'src', kind: 'dir' },
      { name: 'Alpha.ts', kind: 'file' },
      { name: '.sdd', kind: 'dir' },
      { name: 'link-dir', kind: 'symlink', symlinkKind: 'dir' },
      { name: 'file10.ts', kind: 'file' },
      { name: 'file2.ts', kind: 'file' }
    ]
    expect(sortEntries(e).map((x) => x.name)).toEqual([
      '.sdd',
      'link-dir',
      'src',
      'Alpha.ts',
      'file2.ts',
      'file10.ts',
      'zeta.ts'
    ])
  })
})

describe('coalesceWatchEvents', () => {
  it('groups filenames into their parent dirs, deduplicated', () => {
    const ev = coalesceWatchEvents('/r', [
      'src/a.ts',
      'src/b.ts',
      'src/nuevo',
      'src/nuevo/n.ts',
      'README.md'
    ])
    expect(ev.all).toBe(false)
    expect(ev.dirs.sort()).toEqual(['/r', '/r/src', '/r/src/nuevo'])
  })
  it('a null filename forces a full re-list', () => {
    expect(coalesceWatchEvents('/r', ['a.ts', null])).toEqual({ root: '/r', dirs: [], all: true })
  })
})
