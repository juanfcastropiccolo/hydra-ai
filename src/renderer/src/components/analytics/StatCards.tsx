import type { SummaryWithDelta } from '@shared/analytics/aggregate'
import { deltaPct } from '@shared/analytics/aggregate'
import styles from './AnalyticsView.module.css'
import { fmtDuration, fmtInt, fmtPct, fmtTokens, fmtUsd } from './formatters'

function Delta({
  cur,
  prev
}: {
  cur: number
  prev: number | null | undefined
}): React.JSX.Element | null {
  if (prev === null || prev === undefined) return null
  const d = deltaPct(cur, prev)
  if (d === null) return <span className={`${styles.delta} ${styles.deltaNeutral}`}>nuevo</span>
  const cls = d > 0 ? styles.deltaUp : d < 0 ? styles.deltaDown : styles.deltaNeutral
  return (
    <span className={`${styles.delta} ${cls}`} title="vs. período anterior">
      {d > 0 ? '↑' : d < 0 ? '↓' : '→'} {fmtPct(Math.abs(d)).replace('+', '')}
    </span>
  )
}

export function StatCards({ s }: { s: SummaryWithDelta }): React.JSX.Element {
  const p = s.previous
  const cards = [
    {
      key: 'tokens',
      label: 'Tokens',
      value: fmtTokens(s.totalTokens),
      title: `Entrada ${fmtInt(s.tokens.input)} · Salida ${fmtInt(s.tokens.output)} · Caché escrita ${fmtInt(s.tokens.cacheWrite)} · Caché leída ${fmtInt(s.tokens.cacheRead)}`,
      delta: <Delta cur={s.totalTokens} prev={p?.totalTokens} />,
      sub: `${fmtTokens(s.tokens.output)} salida · ${fmtTokens(s.tokens.cacheRead)} caché`
    },
    {
      key: 'cost',
      label: 'Costo estimado',
      value: fmtUsd(s.costUsd),
      title: 'Estimado con la tabla de precios de Hydra (ui.analytics.pricing)',
      delta: <Delta cur={s.costUsd} prev={p?.costUsd} />,
      sub: s.unknownModels.length
        ? `${s.unknownModels.length} modelo(s) sin precio`
        : 'equivalente API'
    },
    {
      key: 'sessions',
      label: 'Sesiones',
      value: fmtInt(s.sessions),
      delta: <Delta cur={s.sessions} prev={p?.sessions} />,
      sub: ''
    },
    {
      key: 'turns',
      label: 'Turnos',
      value: fmtInt(s.turns),
      delta: <Delta cur={s.turns} prev={p?.turns} />,
      sub: s.sessions ? `${(s.turns / s.sessions).toFixed(1)} por sesión` : ''
    },
    {
      key: 'time',
      label: 'Claude trabajando',
      value: fmtDuration(s.durationMs),
      delta: <Delta cur={s.durationMs} prev={p?.durationMs} />,
      sub: ''
    }
  ]
  return (
    <div className={styles.cards} data-testid="stat-cards">
      {cards.map((c) => (
        <div key={c.key} className={styles.card} title={c.title} data-testid={`stat-${c.key}`}>
          <div className={styles.cardLabel}>{c.label}</div>
          <div className={styles.cardValue} data-testid={`stat-${c.key}-value`}>
            {c.value}
          </div>
          <div className={styles.cardFoot}>
            {c.delta}
            {c.sub && <span className={styles.cardSub}>{c.sub}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}
