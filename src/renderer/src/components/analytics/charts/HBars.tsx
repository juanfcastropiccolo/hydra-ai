// Horizontal bars (one per entity), value at the tip, optional click-to-filter.
import styles from './charts.module.css'

export interface HBarRow {
  key: string
  label: string
  value: number
  /** 0..1 share shown next to the value */
  share?: number
  color?: string
  highlight?: boolean
  /** Secondary text (e.g. "3 sesiones") */
  meta?: string
}

export function HBars({
  rows,
  format,
  onClick,
  activeKey,
  testId
}: {
  rows: HBarRow[]
  format: (v: number) => string
  onClick?: (key: string) => void
  activeKey?: string | null
  testId?: string
}): React.JSX.Element {
  const max = Math.max(0, ...rows.map((r) => r.value))
  return (
    <div className={styles.hbars} data-testid={testId}>
      {rows.map((r) => {
        const pct = max > 0 ? (r.value / max) * 100 : 0
        const active = activeKey === r.key
        return (
          <button
            key={r.key}
            type="button"
            className={`${styles.hrow} ${onClick ? styles.hrowClickable : ''} ${active ? styles.hrowActive : ''}`}
            onClick={() => onClick?.(r.key)}
            title={onClick ? (active ? 'Quitar filtro' : 'Filtrar por este proyecto') : undefined}
            data-testid="hbar-row"
            data-key={r.key}
          >
            <span className={`${styles.hlabel} ${r.highlight ? styles.hlabelStrong : ''}`}>
              {r.label}
              {r.meta && <span className={styles.hmeta}> · {r.meta}</span>}
            </span>
            <span className={styles.htrack}>
              <span
                className={styles.hfill}
                style={{ width: `${pct}%`, background: r.color ?? 'var(--accent-dim)' }}
              />
            </span>
            <span className={styles.hvalue}>
              {format(r.value)}
              {r.share !== undefined && (
                <span className={styles.hshare}> {Math.round(r.share * 100)}%</span>
              )}
            </span>
          </button>
        )
      })}
      {rows.length === 0 && <div className={styles.emptyInline}>Sin datos</div>}
    </div>
  )
}
