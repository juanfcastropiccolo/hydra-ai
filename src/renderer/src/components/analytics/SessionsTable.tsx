import { useMemo } from 'react'
import type { SessionRow, SortKey } from '@shared/analytics/aggregate'
import { sortSessions } from '@shared/analytics/aggregate'
import styles from './AnalyticsView.module.css'
import { modelLabel } from './charts/palette'
import { fmtDateTime, fmtDuration, fmtInt, fmtTokens, fmtUsd } from './formatters'

const COLS: Array<{ key: SortKey; label: string; num?: boolean }> = [
  { key: 'title', label: 'Sesión' },
  { key: 'project', label: 'Proyecto' },
  { key: 'firstTs', label: 'Inicio' },
  { key: 'duration', label: 'Duración', num: true },
  { key: 'turns', label: 'Turnos', num: true },
  { key: 'tokens', label: 'Tokens', num: true },
  { key: 'cost', label: 'Costo est.', num: true },
  { key: 'model', label: 'Modelo' }
]
const PAGE = 200

export function SessionsTable({
  rows,
  sort,
  onSort,
  onOpenLive,
  colors
}: {
  rows: SessionRow[]
  sort: { key: SortKey; dir: 'asc' | 'desc' }
  onSort: (k: SortKey) => void
  onOpenLive: (sessionId: string) => void
  colors: Map<string, string>
}): React.JSX.Element {
  const sorted = useMemo(() => sortSessions(rows, sort.key, sort.dir), [rows, sort])
  const shown = sorted.slice(0, PAGE)
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table} data-testid="sessions-table">
        <thead>
          <tr>
            {COLS.map((c) => (
              <th
                key={c.key}
                className={`${c.num ? styles.num : ''} ${sort.key === c.key ? styles.thActive : ''}`}
                onClick={() => onSort(c.key)}
                role="columnheader"
                aria-sort={
                  sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'
                }
                data-testid={`th-${c.key}`}
              >
                {c.label}
                {sort.key === c.key && (
                  <span className={styles.sortArrow}>{sort.dir === 'asc' ? '↑' : '↓'}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr
              key={r.sessionId}
              className={r.live ? styles.rowLive : ''}
              onClick={() => r.live && onOpenLive(r.sessionId)}
              title={r.live ? 'Sesión viva — clic para ir al pane' : r.cwd}
              data-testid="session-row"
              data-session-id={r.sessionId}
              data-live={r.live}
            >
              <td className={styles.tdTitle}>
                {r.live && <span className={styles.liveDot} aria-label="viva" />}
                <span className={styles.titleText}>{r.title}</span>
              </td>
              <td className={r.project.projectId ? styles.tdProjectHydra : styles.tdProject}>
                {r.project.label}
              </td>
              <td className={styles.tdMuted}>{fmtDateTime(r.firstTs)}</td>
              <td className={styles.num}>{fmtDuration(Math.max(0, r.lastTs - r.firstTs))}</td>
              <td className={styles.num}>{fmtInt(r.userTurns)}</td>
              <td
                className={styles.num}
                title={`in ${fmtInt(r.tokens.input)} · out ${fmtInt(r.tokens.output)} · caché ${fmtInt(r.tokens.cacheWrite + r.tokens.cacheRead)}`}
              >
                {fmtTokens(r.totalTokens)}
              </td>
              <td className={styles.num}>{fmtUsd(r.costUsd)}</td>
              <td>
                {r.mainModel ? (
                  <span className={styles.modelChip}>
                    <span
                      className={styles.swatch}
                      style={{ background: colors.get(r.mainModel) ?? '#6b6b70' }}
                    />
                    {modelLabel(r.mainModel)}
                  </span>
                ) : (
                  <span className={styles.tdMuted}>—</span>
                )}
              </td>
            </tr>
          ))}
          {shown.length === 0 && (
            <tr>
              <td colSpan={COLS.length} className={styles.emptyCell}>
                Sin sesiones en este rango.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {sorted.length > PAGE && (
        <div className={styles.tableMore}>
          Mostrando {PAGE} de {sorted.length} sesiones — acotá el rango para ver el resto.
        </div>
      )}
    </div>
  )
}
