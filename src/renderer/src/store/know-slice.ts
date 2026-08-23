// Feature 006: Graph Know view state. Separate vanilla store (same pattern as the other slices).
import { createStore, useStore, type StoreApi } from 'zustand'
import type { KnowSearchHit, KnowStatus, SessionCard } from '@shared/know/types'

export interface GraphData {
  nodes: Array<{
    id: string
    label: string
    kind: 'project' | 'session' | 'file' | 'topic' | 'fact'
    weight: number
  }>
  edges: Array<{ a: string; b: string; w: number }>
}

export interface KnowState {
  status: KnowStatus | null
  query: string
  hits: KnowSearchHit[]
  searching: boolean
  /** Session whose card is open in the side panel. */
  openSessionId: string | null
  openCard: SessionCard | null
  graph: GraphData | null
  /** Node ids highlighted by the current search. */
  highlight: string[]
  selectedNode: string | null
  error: string | null

  setStatus(s: KnowStatus): void
  setQuery(q: string): void
  setHits(h: KnowSearchHit[], forQuery: string): void
  setSearching(b: boolean): void
  openSession(id: string | null, card: SessionCard | null): void
  setGraph(g: GraphData): void
  mergeGraph(g: GraphData): void
  setHighlight(ids: string[]): void
  selectNode(id: string | null): void
  setError(e: string | null): void
  reset(): void
}

export function createKnowStore(): StoreApi<KnowState> {
  return createStore<KnowState>((set, get) => ({
    status: null,
    query: '',
    hits: [],
    searching: false,
    openSessionId: null,
    openCard: null,
    graph: null,
    highlight: [],
    selectedNode: null,
    error: null,

    setStatus: (status) => set({ status }),
    setQuery: (query) => set({ query }),
    setHits: (hits, forQuery) => {
      if (get().query !== forQuery) return // stale response
      set({ hits, searching: false, highlight: hits.map((h) => `s:${h.sessionId}`) })
    },
    setSearching: (searching) => set({ searching }),
    openSession: (openSessionId, openCard) => set({ openSessionId, openCard }),
    setGraph: (graph) => set({ graph }),
    mergeGraph: (g) =>
      set((s) => {
        if (!s.graph) return { graph: g }
        const ids = new Set(s.graph.nodes.map((n) => n.id))
        const nodes = [...s.graph.nodes, ...g.nodes.filter((n) => !ids.has(n.id))]
        const ek = (e: { a: string; b: string }): string => `${e.a}→${e.b}`
        const eks = new Set(s.graph.edges.map(ek))
        const edges = [...s.graph.edges, ...g.edges.filter((e) => !eks.has(ek(e)))]
        return { graph: { nodes, edges } }
      }),
    setHighlight: (highlight) => set({ highlight }),
    selectNode: (selectedNode) => set({ selectedNode }),
    setError: (error) => set({ error }),
    reset: () =>
      set({
        query: '',
        hits: [],
        searching: false,
        openSessionId: null,
        openCard: null,
        highlight: [],
        selectedNode: null,
        error: null
      })
  }))
}

export const knowStore = createKnowStore()
export function useKnow<T>(selector: (s: KnowState) => T): T {
  return useStore(knowStore, selector)
}
