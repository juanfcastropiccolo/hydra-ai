import { describe, expect, it } from 'vitest'
import { createFileTreeStore, HIGHLIGHT_MS, statusForPath } from './file-tree-slice'

describe('file-tree store', () => {
  it('follows focus only when the project changes; losing focus keeps the last project', () => {
    const st = createFileTreeStore()
    st.getState().setProjectFromFocus('A', '/a')
    st.getState().expand('/a/src')
    st.getState().setProjectFromFocus(null, null)
    expect(st.getState().projectId).toBe('A')
    st.getState().setProjectFromFocus('A', '/a')
    expect(st.getState().isExpanded('/a/src')).toBe(true) // same project → nothing reset
    st.getState().setProjectFromFocus('B', '/b')
    expect(st.getState()).toMatchObject({
      projectId: 'B',
      root: '/b',
      nodes: {},
      selectedPath: null
    })
    // expansions are kept per project
    st.getState().setProjectFromFocus('A', '/a')
    expect(st.getState().isExpanded('/a/src')).toBe(true)
  })
  it('expand/collapse per project; collapse removes descendants; collapseAll', () => {
    const st = createFileTreeStore()
    st.getState().setProjectFromFocus('A', '/a')
    st.getState().expand('/a/src')
    st.getState().expand('/a/src/deep')
    st.getState().expand('/a/srcx')
    st.getState().collapse('/a/src')
    expect(st.getState().expandedByProject['A']).toEqual(['/a/srcx'])
    st.getState().toggleDir('/a/t')
    expect(st.getState().isExpanded('/a/t')).toBe(true)
    st.getState().collapseAll()
    expect(st.getState().expandedByProject['A']).toEqual([])
  })
  it('setNodes highlights new entries (not on first load) and pruneHighlights expires them', () => {
    const st = createFileTreeStore()
    st.getState().setProjectFromFocus('A', '/a')
    st.getState().setNodes('/a', [{ name: 'x.ts', kind: 'file' }], 1000)
    expect(st.getState().highlights).toEqual({})
    st.getState().setNodes(
      '/a',
      [
        { name: 'x.ts', kind: 'file' },
        { name: 'y.ts', kind: 'file' }
      ],
      2000
    )
    expect(st.getState().highlights).toEqual({ '/a/y.ts': 2000 + HIGHLIGHT_MS })
    st.getState().pruneHighlights(2000 + HIGHLIGHT_MS - 1)
    expect(Object.keys(st.getState().highlights)).toHaveLength(1)
    st.getState().pruneHighlights(2000 + HIGHLIGHT_MS + 1)
    expect(st.getState().highlights).toEqual({})
  })
  it('dirsToRefresh: only expanded dirs (+root) of the shown project; all → every expanded', () => {
    const st = createFileTreeStore()
    st.getState().setProjectFromFocus('A', '/a')
    st.getState().expand('/a/src')
    expect(
      st
        .getState()
        .dirsToRefresh({ root: '/a', dirs: ['/a/src', '/a/other', '/a'], all: false })
        .sort()
    ).toEqual(['/a', '/a/src'])
    expect(st.getState().dirsToRefresh({ root: '/a', dirs: [], all: true }).sort()).toEqual([
      '/a',
      '/a/src'
    ])
    expect(st.getState().dirsToRefresh({ root: '/zzz', dirs: ['/zzz'], all: true })).toEqual([])
  })
  it('filter does not touch expansions; clearing it drops matches', () => {
    const st = createFileTreeStore()
    st.getState().setProjectFromFocus('A', '/a')
    st.getState().expand('/a/src')
    st.getState().setFilter('sto')
    st.getState().setFilterMatches(['src/store.ts'])
    expect(st.getState().filterMatches).toEqual(['src/store.ts'])
    st.getState().setFilter('')
    expect(st.getState().filterMatches).toBeNull()
    expect(st.getState().isExpanded('/a/src')).toBe(true)
  })
  it('setPrefs / toggleOpen / loading set', () => {
    const st = createFileTreeStore()
    st.getState().setPrefs({ open: true, width: 420 })
    expect(st.getState()).toMatchObject({ open: true, width: 420 })
    st.getState().toggleOpen()
    expect(st.getState().open).toBe(false)
    st.getState().setLoading('/a', true)
    st.getState().setLoading('/a', true)
    expect(st.getState().loadingDirs).toEqual(['/a'])
    st.getState().setLoading('/a', false)
    expect(st.getState().loadingDirs).toEqual([])
  })
})

describe('statusForPath', () => {
  const st = {
    'src/a.ts': 'modified',
    'new.ts': 'untracked',
    'dist/': 'ignored',
    'pkg/x/y.ts': 'added'
  } as const
  it('direct, inherited-ignored, folder aggregate', () => {
    expect(statusForPath('src/a.ts', false, st)).toBe('modified')
    expect(statusForPath('dist/bundle.js', false, st)).toBe('ignored')
    expect(statusForPath('dist', true, st)).toBe('ignored')
    expect(statusForPath('src', true, st)).toBe('modified')
    expect(statusForPath('pkg', true, st)).toBe('added')
    expect(statusForPath('README.md', false, st)).toBeNull()
    expect(statusForPath('docs', true, st)).toBeNull()
  })
})
