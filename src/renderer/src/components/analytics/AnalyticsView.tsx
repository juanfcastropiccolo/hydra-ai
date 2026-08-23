// Feature 005: the dashboard. Owns the data lifecycle (open → events → close) and derives every
// aggregate with useMemo over the pure functions in @shared/analytics.
import { useEffect, useMemo } from 'react'
import {
  byDay,
  byModel,
  byProject,
  decorateSessions,
  filterSessions,
  heatmap,
  rangeBounds,
  summarize
} from '@shared/analytics/aggregate'
import { costOfTokens } from '@shared/analytics/cost'
import { resolvePricing } from '@shared/analytics/pricing'
import type { AnalyticsRange, TokenCounts } from '@shared/analytics/types'
import { hydra } from '../../lib/hydra-client'
import { useAppStore } from '../../store/app-store'
import { analyticsStore, useAnalytics } from '../../store/analytics-slice'
import styles from './AnalyticsView.module.css'
import { HBars } from './charts/HBars'
import { Heatmap } from './charts/Heatmap'
import { assignColors, colorOf, modelLabel } from './charts/palette'
import { StackedBars } from './charts/StackedBars'
import { fmtDayKey, fmtInt, fmtTokens, fmtUsd } from './formatters'
import { RangePicker } from './RangePicker'
import { SessionsTable } from './SessionsTable'
import { StatCards } from './StatCards'

export function AnalyticsView(): React.JSX.Element {
  const sessions = useAnalytics((s) => s.sessions)
  const loaded = useAnalytics((s) => s.loaded)
  const progress = useAnalytics((s) => s.progress)
  const range = useAnalytics((s) => s.range)
  const projectKey = useAnalytics((s) => s.projectKey)
  const metric = useAnalytics((s) => s.metric)
  const heatMetric = useAnalytics((s) => s.heatMetric)
  const sort = useAnalytics((s) => s.sort)
  const pricing = useAnalytics((s) => s.pricing)
  const error = useAnalytics((s) => s.error)
  const now = useAnalytics((s) => s.now)
  const projects = useAppStore((s) => s.projects)
  const liveSessions = useAppStore((s) => s.sessions)
  const focus = useAppStore((s) => s.focus)
  const setCenterView = useAppStore((s) => s.setCenterView)

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
    () => rangeBounds(range, now || 0, earliest || undefined),
    [range, now, earliest]
  )
  const filter = useMemo(() => ({ bounds, projectKey }), [bounds, projectKey])
  const inRange = useMemo(() => filterSessions(rows, filter), [rows, filter])
  const summary = useMemo(() => summarize(rows, filter, pricing), [rows, filter, pricing])
  const days = useMemo(() => byDay(inRange, bounds), [inRange, bounds])
  const projectStats = useMemo(
    () => byProject(filterSessions(rows, { bounds, projectKey: null }), bounds, pricing),
    [rows, bounds, pricing]
  )
  const modelStats = useMemo(() => byModel(inRange, bounds, pricing), [inRange, bounds, pricing])
  const heat = useMemo(() => heatmap(inRange, heatMetric), [inRange, heatMetric])
  const modelColors = useMemo(
    () => assignColors(rows.flatMap((r) => Object.keys(r.tokensByModel))),
    [rows]
  )

  const buckets = useMemo(() => {
    const valueOf = (model: string, t: TokenCounts): number => {
      if (metric === 'tokens') return t.input + t.output + t.cacheWrite + t.cacheRead
      const p = resolvePricing(model, pricing)
      return p ? costOfTokens(t, p) : 0
    }
    return days.buckets.map((b) => ({
      key: b.key,
      label: fmtDayKey(b.key),
      segments: Object.entries(b.byModel).map(([model, t]) => ({
        key: model,
        value: valueOf(model, t)
      }))
    }))
  }, [days, metric, pricing])
  const fmtMetric =
    metric === 'tokens' ? fmtTokens : (v: number): string => fmtUsd(v, { compact: true })

  const setRange = (r: AnalyticsRange): void => {
    analyticsStore.getState().setRange(r)
    void hydra.setAnalytics({ range: r })
  }
  const openLive = (sessionId: string): void => {
    setCenterView('sessions')
    void hydra.setCenterView('sessions')
    focus(sessionId)
  }
  const reindex = (): void => {
    analyticsStore.getState().setProgress({ phase: 'scan', done: 0, total: 1 })
    void hydra.analyticsReindex()
  }

  const scanning = progress !== null && progress.phase === 'scan' && progress.done < progress.total
  const empty = loaded && !scanning && sessions.length === 0
  const emptyRange = loaded && sessions.length > 0 && inRange.length === 0
  const activeProject = projectKey ? projectStats.find((p) => p.key === projectKey) : null

  return (
    <div className={styles.view} data-testid="analytics-root" data-loaded={loaded}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.h1}>Analytics</h1>
          <p className={styles.subtitle}>
            Uso de Claude Code en esta máquina
            {activeProject && (
              <>
                {' · '}
                <button
                  type="button"
                  className={styles.filterChip}
                  onClick={() => analyticsStore.getState().setProjectKey(null)}
                  title="Quitar el filtro de proyecto"
                  data-testid="project-filter-chip"
                >
                  {activeProject.label} ✕
                </button>
              </>
            )}
          </p>
        </div>
        <div className={styles.headerRight}>
          <RangePicker range={range} onChange={setRange} />
          <button
            type="button"
            className={styles.ghostBtn}
            onClick={reindex}
            title="Borrar el caché y volver a leer todos los transcripts"
            data-testid="reindex"
          >
            Reindexar
          </button>
        </div>
      </header>

      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}
      {scanning && progress && (
        <div className={styles.progress} data-testid="analytics-progress" role="status">
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
            />
          </div>
          <span>
            Indexando transcripts… {progress.done}/{progress.total}
          </span>
        </div>
      )}
      {!loaded && !error && <div className={styles.loading}>Cargando…</div>}

      {empty && (
        <div className={styles.empty} data-testid="analytics-empty">
          <h2>Todavía no hay sesiones</h2>
          <p>Cuando uses Claude Code en esta máquina, sus transcripts aparecerán acá.</p>
        </div>
      )}

      {loaded && sessions.length > 0 && (
        <>
          <StatCards s={summary} />
          {emptyRange && (
            <div className={styles.emptyRange} data-testid="analytics-empty-range">
              No hay sesiones en este rango{activeProject ? ' para ese proyecto' : ''}. Probá con{' '}
              <button type="button" className={styles.linkBtn} onClick={() => setRange('30d')}>
                30 días
              </button>{' '}
              o{' '}
              <button type="button" className={styles.linkBtn} onClick={() => setRange('all')}>
                Todo
              </button>
              .
            </div>
          )}
          <section className={styles.panel} data-testid="usage-by-day">
            <div className={styles.panelHead}>
              <h2>Uso por {days.unit === 'week' ? 'semana' : 'día'}</h2>
              <div className={styles.segmented} role="group" aria-label="Métrica">
                <button
                  type="button"
                  className={metric === 'tokens' ? styles.segActive : ''}
                  onClick={() => analyticsStore.getState().setMetric('tokens')}
                  data-testid="metric-tokens"
                >
                  Tokens
                </button>
                <button
                  type="button"
                  className={metric === 'cost' ? styles.segActive : ''}
                  onClick={() => analyticsStore.getState().setMetric('cost')}
                  data-testid="metric-cost"
                >
                  Costo est.
                </button>
              </div>
            </div>
            <StackedBars
              buckets={buckets}
              colors={modelColors}
              seriesLabel={modelLabel}
              format={fmtMetric}
              testId="usage-chart"
            />
            <div className={styles.legend}>
              {modelStats.map((m) => (
                <span key={m.model} className={styles.legendItem}>
                  <span
                    className={styles.swatch}
                    style={{ background: colorOf(modelColors, m.model) }}
                  />
                  {modelLabel(m.model)}
                </span>
              ))}
              {metric === 'cost' && <span className={styles.legendNote}>costo estimado</span>}
            </div>
          </section>

          <div className={styles.twoCol}>
            <section className={styles.panel} data-testid="when-heatmap">
              <div className={styles.panelHead}>
                <h2>Cuándo trabajo</h2>
                <div className={styles.segmented} role="group" aria-label="Métrica del mapa">
                  <button
                    type="button"
                    className={heatMetric === 'turns' ? styles.segActive : ''}
                    onClick={() => analyticsStore.getState().setHeatMetric('turns')}
                    data-testid="heat-turns"
                  >
                    Turnos
                  </button>
                  <button
                    type="button"
                    className={heatMetric === 'tokens' ? styles.segActive : ''}
                    onClick={() => analyticsStore.getState().setHeatMetric('tokens')}
                    data-testid="heat-tokens"
                  >
                    Tokens
                  </button>
                </div>
              </div>
              <Heatmap
                grid={heat.grid}
                max={heat.max}
                format={heatMetric === 'turns' ? (v) => `${fmtInt(v)} turnos` : fmtTokens}
                testId="heatmap"
              />
            </section>
            <section className={styles.panel} data-testid="by-project">
              <div className={styles.panelHead}>
                <h2>Por proyecto</h2>
                <span className={styles.muted}>{projectStats.length} proyectos</span>
              </div>
              <HBars
                rows={projectStats.map((p) => ({
                  key: p.key,
                  label: p.label,
                  value: metric === 'tokens' ? p.totalTokens : p.costUsd,
                  share: p.share,
                  highlight: Boolean(p.projectId),
                  meta: `${p.sessions} ${p.sessions === 1 ? 'sesión' : 'sesiones'}`,
                  color: p.projectId ? 'var(--accent-dim)' : '#4b5563'
                }))}
                format={fmtMetric}
                onClick={(k) => analyticsStore.getState().toggleProjectKey(k)}
                activeKey={projectKey}
                testId="project-bars"
              />
            </section>
          </div>

          <div className={styles.twoCol}>
            <section className={styles.panel} data-testid="by-model">
              <div className={styles.panelHead}>
                <h2>Por modelo</h2>
                {summary.unknownModels.length > 0 && (
                  <span className={styles.warnNote} title={summary.unknownModels.join(', ')}>
                    {summary.unknownModels.length} sin precio:{' '}
                    {summary.unknownModels.map(modelLabel).join(', ')}
                  </span>
                )}
              </div>
              <table className={styles.miniTable}>
                <thead>
                  <tr>
                    <th>Modelo</th>
                    <th className={styles.num}>Tokens</th>
                    <th className={styles.num}>Costo est.</th>
                    <th className={styles.num}>%</th>
                  </tr>
                </thead>
                <tbody>
                  {modelStats.map((m) => (
                    <tr key={m.model} data-testid="model-row">
                      <td>
                        <span className={styles.modelChip}>
                          <span
                            className={styles.swatch}
                            style={{ background: colorOf(modelColors, m.model) }}
                          />
                          {modelLabel(m.model)}
                        </span>
                        <span className={styles.modelId}>{m.model}</span>
                      </td>
                      <td className={styles.num}>{fmtTokens(m.totalTokens)}</td>
                      <td className={styles.num}>{fmtUsd(m.costUsd)}</td>
                      <td className={styles.num}>{Math.round(m.share * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section className={styles.panel} data-testid="by-tokens-kind">
              <div className={styles.panelHead}>
                <h2>Tipo de tokens</h2>
              </div>
              <HBars
                rows={[
                  {
                    key: 'cacheRead',
                    label: 'Caché leída',
                    value: summary.tokens.cacheRead,
                    color: '#199e70'
                  },
                  {
                    key: 'cacheWrite',
                    label: 'Caché escrita',
                    value: summary.tokens.cacheWrite,
                    color: '#c98500'
                  },
                  { key: 'input', label: 'Entrada', value: summary.tokens.input, color: '#3987e5' },
                  { key: 'output', label: 'Salida', value: summary.tokens.output, color: '#d55181' }
                ].map((r) => ({
                  ...r,
                  share: summary.totalTokens ? r.value / summary.totalTokens : 0
                }))}
                format={fmtTokens}
              />
            </section>
          </div>

          <section className={styles.panel} data-testid="sessions-panel">
            <div className={styles.panelHead}>
              <h2>Sesiones</h2>
              <span className={styles.muted}>{inRange.length} en el rango</span>
            </div>
            <SessionsTable
              rows={inRange}
              sort={sort}
              onSort={(k) => analyticsStore.getState().sortBy(k)}
              onOpenLive={openLive}
              colors={modelColors}
            />
          </section>
        </>
      )}
    </div>
  )
}
