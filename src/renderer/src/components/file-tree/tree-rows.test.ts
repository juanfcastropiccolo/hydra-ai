import { describe, expect, it } from 'vitest'
import { flattenTree } from './tree-rows'

const nodes = {
  '/r': [
    { name: 'src', kind: 'dir' as const },
    { name: 'a.ts', kind: 'file' as const }
  ],
  '/r/src': [
    { name: 'deep', kind: 'dir' as const },
    { name: 'b.ts', kind: 'file' as const }
  ],
  '/r/src/deep': [{ name: 'c.ts', kind: 'file' as const }]
}

describe('flattenTree', () => {
  it('renders only expanded dirs', () => {
    const rows = flattenTree({
      root: '/r',
      nodes,
      isExpanded: (d) => d === '/r/src',
      filterMatches: null
    })
    expect(rows.map((r) => `${r.depth}:${r.rel}`)).toEqual([
      '0:src',
      '1:src/deep',
      '1:src/b.ts',
      '0:a.ts'
    ])
    expect(rows.map((r) => r.name)).toEqual(['src', 'deep', 'b.ts', 'a.ts'])
  })
  it('filter mode lists the matches flat, labelled by relative path (dirs end with /)', () => {
    const rows = flattenTree({
      root: '/r',
      nodes,
      isExpanded: () => false,
      filterMatches: new Set(['src/deep/c.ts', 'src/deep/'])
    })
    expect(rows.map((r) => [r.rel, r.name, r.depth, r.isDir])).toEqual([
      ['src/deep/c.ts', 'src/deep/c.ts', 0, false],
      ['src/deep', 'src/deep', 0, true]
    ])
    expect(rows[0]?.path).toBe('/r/src/deep/c.ts')
  })
})
