import { useState } from 'react'
import type { AnalyticsRange, AnalyticsRangePreset } from '@shared/analytics/types'
import styles from './AnalyticsView.module.css'

const PRESETS: Array<{ key: AnalyticsRangePreset; label: string }> = [
  { key: 'today', label: 'Hoy' },
  { key: '7d', label: '7 días' },
  { key: '30d', label: '30 días' },
  { key: 'all', label: 'Todo' }
]

export function RangePicker({
  range,
  onChange
}: {
  range: AnalyticsRange
  onChange: (r: AnalyticsRange) => void
}): React.JSX.Element {
  const custom = typeof range === 'object'
  const [from, setFrom] = useState(custom ? range.from : '')
  const [to, setTo] = useState(custom ? range.to : '')
  const [editing, setEditing] = useState(custom)
  const apply = (f: string, t: string): void => {
    if (f && t && f <= t) onChange({ from: f, to: t })
  }
  return (
    <div className={styles.rangePicker} role="group" aria-label="Rango">
      {PRESETS.map((p) => (
        <button
          key={p.key}
          type="button"
          className={`${styles.chip} ${range === p.key ? styles.chipActive : ''}`}
          onClick={() => {
            setEditing(false)
            onChange(p.key)
          }}
          data-testid={`range-${p.key}`}
          aria-pressed={range === p.key}
        >
          {p.label}
        </button>
      ))}
      <button
        type="button"
        className={`${styles.chip} ${custom ? styles.chipActive : ''}`}
        onClick={() => setEditing((e) => !e)}
        data-testid="range-custom"
        aria-pressed={custom}
      >
        Personalizado
      </button>
      {editing && (
        <span className={styles.customRange}>
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value)
              apply(e.target.value, to)
            }}
            data-testid="range-from"
          />
          <span className={styles.muted}>→</span>
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value)
              apply(from, e.target.value)
            }}
            data-testid="range-to"
          />
        </span>
      )}
    </div>
  )
}
