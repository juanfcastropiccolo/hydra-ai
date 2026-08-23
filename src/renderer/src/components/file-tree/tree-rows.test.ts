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
    expect(rows.map((r) => `${r.depth}:${r.rel}`)).toEqual(['0:src', '1:deep', '1:b.ts', '0:a.ts'])
  })
  it('filter mode shows matches with ancestors, everything expanded', () => {
    const rows = flattenTree({
      root: '/r',
      nodes,
      isExpanded: () => false,
      filterMatches: new Set(['src/deep/c.ts'])
    })
    expect(rows.map((r) => r.rel)).toEqual(['src', 'src/deep', 'src/deep/c.ts'])
  })
})
