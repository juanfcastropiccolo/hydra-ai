import { describe, expect, it } from 'vitest'
import { createKnowStore } from './know-slice'

const hit = (id: string): never =>
  ({
    sessionId: id,
    title: id,
    cwd: '/x',
    projectLabel: 'P',
    firstTs: 1,
    lastTs: 2,
    score: 1,
    facts: [],
    replaced: [],
    entities: []
  }) as never

describe('know store', () => {
  it('ignores stale search responses and highlights result sessions', () => {
    const st = createKnowStore()
    st.getState().setQuery('auth')
    st.getState().setSearching(true)
    st.getState().setHits([hit('A')], 'vieja-query')
    expect(st.getState().hits).toEqual([])
    st.getState().setHits([hit('A')], 'auth')
    expect(st.getState().hits).toHaveLength(1)
    expect(st.getState()).toMatchObject({ searching: false, highlight: ['s:A'] })
  })
  it('mergeGraph dedupes nodes and edges; reset clears view state', () => {
    const st = createKnowStore()
    st.getState().setGraph({
      nodes: [{ id: 'a', label: 'a', kind: 'topic', weight: 1 }],
      edges: []
    })
    st.getState().mergeGraph({
      nodes: [
        { id: 'a', label: 'a', kind: 'topic', weight: 1 },
        { id: 'b', label: 'b', kind: 'file', weight: 2 }
      ],
      edges: [{ a: 'a', b: 'b', w: 1 }]
    })
    st.getState().mergeGraph({ nodes: [], edges: [{ a: 'a', b: 'b', w: 1 }] })
    expect(st.getState().graph).toEqual({
      nodes: [
        { id: 'a', label: 'a', kind: 'topic', weight: 1 },
        { id: 'b', label: 'b', kind: 'file', weight: 2 }
      ],
      edges: [{ a: 'a', b: 'b', w: 1 }]
    })
    st.getState().selectNode('a')
    st.getState().reset()
    expect(st.getState()).toMatchObject({ selectedNode: null, graph: st.getState().graph })
  })
})
