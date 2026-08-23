// Feature 005: dashboard state. Separate vanilla store (same pattern as file-tree-slice). Raw
// SessionSummary[] come from main; everything derived is computed by components with useMemo over
// the pure functions in @shared/analytics (keeps selectors primitive/stable).
import { createStore, useStore, type StoreApi } from 'zustand'
import type { SortKey } from '@shared/analytics/aggregate'
import type {
  AnalyticsPrefs,
  AnalyticsProgress,
  AnalyticsRange,
  ModelPricing,
  SessionSummary
} from '@shared/analytics/types'

export type UsageMetric = 'tokens' | 'cost'
export type HeatMetric = 'turns' | 'tokens'

export interface AnalyticsState {
  sessions: SessionSummary[]
  /** Null until the first analytics.open answered. */
  loaded: boolean
  fromCache: boolean
  progress: AnalyticsProgress | null
  range: AnalyticsRange
  projectKey: string | null
  metric: UsageMetric
  heatMetric: HeatMetric
  sort: { key: SortKey; dir: 'asc' | 'desc' }
  pricing: Record<string, ModelPricing>
  error: string | null

  setSessions(sessions: SessionSummary[], fromCache?: boolean): void
  setProgress(p: AnalyticsProgress | null): void
  setPrefs(p: AnalyticsPrefs): void
  setRange(r: AnalyticsRange): void
  setProjectKey(k: string | null): void
  toggleProjectKey(k: string): void
  setMetric(m: UsageMetric): void
  setHeatMetric(m: HeatMetric): void
  /** Clicking the active column flips direction; another column → desc (asc for text columns). */
  sortBy(key: SortKey): void
  setError(e: string | null): void
  reset(): void
}

const TEXT_KEYS: SortKey[] = ['title', 'project', 'model']

export function createAnalyticsStore(): StoreApi<AnalyticsState> {
  return createStore<AnalyticsState>((set, get) => ({
    sessions: [],
    loaded: false,
    fromCache: false,
    progress: null,
    range: '7d',
    projectKey: null,
    metric: 'tokens',
    heatMetric: 'turns',
    sort: { key: 'firstTs', dir: 'desc' },
    pricing: {},
    error: null,

    setSessions: (sessions, fromCache) =>
      set((s) => ({ sessions, loaded: true, fromCache: fromCache ?? s.fromCache })),
    setProgress: (progress) => set({ progress }),
    setPrefs: (p) => set({ range: p.range, pricing: p.pricing }),
    setRange: (range) => set({ range }),
    setProjectKey: (projectKey) => set({ projectKey }),
    toggleProjectKey: (k) => set((s) => ({ projectKey: s.projectKey === k ? null : k })),
    setMetric: (metric) => set({ metric }),
    setHeatMetric: (heatMetric) => set({ heatMetric }),
    sortBy: (key) => {
      const cur = get().sort
      if (cur.key === key) set({ sort: { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' } })
      else set({ sort: { key, dir: TEXT_KEYS.includes(key) ? 'asc' : 'desc' } })
    },
    setError: (error) => set({ error }),
    reset: () => set({ sessions: [], loaded: false, fromCache: false, progress: null, error: null })
  }))
}

export const analyticsStore = createAnalyticsStore()
export function useAnalytics<T>(selector: (s: AnalyticsState) => T): T {
  return useStore(analyticsStore, selector)
}
