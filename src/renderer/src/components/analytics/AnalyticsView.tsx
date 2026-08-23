// Feature 005: the dashboard. Owns the data lifecycle (open → events → close) and derives every
// aggregate with useMemo over the pure functions in @shared/analytics.
import { useEffect, useMemo } from 'react'
import { decorateSessions, rangeBounds } from '@shared/analytics/aggregate'
import { hydra } from '../../lib/hydra-client'
import { useAppStore } from '../../store/app-store'
import { analyticsStore, useAnalytics } from '../../store/analytics-slice'
import styles from './AnalyticsView.module.css'

export function AnalyticsView(): React.JSX.Element {
  const sessions = useAnalytics((s) => s.sessions)
  const loaded = useAnalytics((s) => s.loaded)
  const progress = useAnalytics((s) => s.progress)
  const range = useAnalytics((s) => s.range)
  const projectKey = useAnalytics((s) => s.projectKey)
  const pricing = useAnalytics((s) => s.pricing)
  const error = useAnalytics((s) => s.error)
  const now = useAnalytics((s) => s.now)
  const projects = useAppStore((s) => s.projects)
  const liveSessions = useAppStore((s) => s.sessions)

  // Data lifecycle: open on mount, subscribe to pushes, close on unmount.
  useEffect(() => {
    const st = analyticsStore.getState()
    const offs = [
      hydra.onAnalyticsProgress((p) => analyticsStore.getState().setProgress(p)),
      hydra.onAnalyticsSessions((e) => analyticsStore.getState().setSessions(e.sessions, e.now))
    ]
    void hydra.getAnalytics().then((p) => analyticsStore.getState().setPrefs(p))
    hydra
      .analyticsOpen()
      .then((r) => analyticsStore.getState().setSessions(r.sessions, r.now, r.fromCache))
      .catch((e: Error) => st.setError(e.message))
    return () => {
      offs.forEach((off) => off())
      void hydra.analyticsClose()
    }
  }, [])

  const liveIds = useMemo(() => new Set(liveSessions.map((s) => s.sessionId)), [liveSessions])
  const rows = useMemo(
    () => decorateSessions(sessions, { projects, pricing, liveSessionIds: liveIds }),
    [sessions, projects, pricing, liveIds]
  )
  const earliest = useMemo(
    () => rows.reduce((m, r) => (r.firstTs > 0 && (m === 0 || r.firstTs < m) ? r.firstTs : m), 0),
    [rows]
  )
  const bounds = useMemo(
    () => rangeBounds(range, now, earliest || undefined),
    [range, now, earliest]
  )
  const filter = useMemo(() => ({ bounds, projectKey }), [bounds, projectKey])
  void filter

  return (
    <div className={styles.view} data-testid="analytics-root">
      {error && <div className={styles.error}>{error}</div>}
      {!loaded && <div className={styles.loading}>Cargando…</div>}
      {progress && progress.phase === 'scan' && progress.done < progress.total && (
        <div className={styles.progress} data-testid="analytics-progress">
          Indexando transcripts… {progress.done}/{progress.total}
        </div>
      )}
      <div className={styles.placeholder}>
        {rows.length} sesiones indexadas · rango {bounds.from} → {bounds.to}
      </div>
    </div>
  )
}
