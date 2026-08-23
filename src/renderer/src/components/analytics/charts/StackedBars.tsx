// Stacked columns over time (one column per day/week), segments by series. SVG, no deps.
import { useMemo } from 'react'
import styles from './charts.module.css'
import { niceTicks } from './ticks'
import { useContainerWidth, useTooltip } from './hooks'
import { Tooltip } from './Tooltip'

export interface StackSegment {
  key: string
  value: number
}
export interface StackBucket {
  key: string
  label: string
  segments: StackSegment[]
}

export interface StackedBarsProps {
  buckets: StackBucket[]
  colors: Map<string, string>
  seriesLabel?: (key: string) => string
  format: (v: number) => string
  height?: number
  /** Show every Nth x label (auto when omitted). */
  testId?: string
}

const PAD = { top: 8, right: 8, bottom: 22, left: 44 }
const GAP = 2 // surface gap between segments (px)

export function StackedBars({
  buckets,
  colors,
  seriesLabel,
  format,
  height = 220,
  testId
}: StackedBarsProps): React.JSX.Element {
  const [ref, width] = useContainerWidth()
  const { tip, show, hide } = useTooltip()
  const totals = useMemo(
    () => buckets.map((b) => b.segments.reduce((n, s) => n + s.value, 0)),
    [buckets]
  )
  const max = Math.max(0, ...totals)
  const innerW = Math.max(10, width - PAD.left - PAD.right)
  const innerH = height - PAD.top - PAD.bottom
  const n = Math.max(1, buckets.length)
  const slot = innerW / n
  const barW = Math.min(24, Math.max(3, slot * 0.62))
  const ticks = niceTicks(max, 4)
  const yOf = (v: number): number => PAD.top + innerH - (max > 0 ? (v / max) * innerH : 0)
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(innerW / 56))))

  return (
    <div className={styles.chart} data-chart data-testid={testId} ref={ref}>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Uso por día"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={yOf(t)}
              y2={yOf(t)}
              className={styles.grid}
            />
            <text x={PAD.left - 6} y={yOf(t) + 3} className={styles.tick} textAnchor="end">
              {format(t)}
            </text>
          </g>
        ))}
        {buckets.map((b, i) => {
          const x = PAD.left + i * slot + (slot - barW) / 2
          let acc = 0
          const segs = b.segments.filter((s) => s.value > 0)
          return (
            <g key={b.key}>
              {segs.map((s, j) => {
                const y0 = yOf(acc)
                acc += s.value
                const y1 = yOf(acc)
                const top = y1 + (j < segs.length - 1 ? 0 : 0)
                const h = Math.max(0, y0 - y1 - (j > 0 ? GAP : 0))
                const isTop = j === segs.length - 1
                const r = isTop ? Math.min(4, barW / 2, h) : 0
                const yTop = y0 - h
                void top
                const d = isTop
                  ? `M${x},${y0} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + barW - r} Q${x + barW},${yTop} ${x + barW},${yTop + r} V${y0} Z`
                  : `M${x},${yTop} H${x + barW} V${y0} H${x} Z`
                return (
                  <path
                    key={s.key}
                    d={d}
                    fill={colors.get(s.key) ?? '#6b6b70'}
                    className={styles.mark}
                    onMouseEnter={(e) =>
                      show(e, tipFor(b, totals[i] ?? 0, colors, seriesLabel, format))
                    }
                    onMouseMove={(e) =>
                      show(e, tipFor(b, totals[i] ?? 0, colors, seriesLabel, format))
                    }
                    onMouseLeave={hide}
                  />
                )
              })}
              {/* invisible hit target over the whole column so empty days still show a tooltip */}
              <rect
                x={PAD.left + i * slot}
                y={PAD.top}
                width={slot}
                height={innerH}
                fill="transparent"
                onMouseEnter={(e) =>
                  show(e, tipFor(b, totals[i] ?? 0, colors, seriesLabel, format))
                }
                onMouseMove={(e) => show(e, tipFor(b, totals[i] ?? 0, colors, seriesLabel, format))}
                onMouseLeave={hide}
              />
              {i % labelEvery === 0 && (
                <text x={x + barW / 2} y={height - 6} className={styles.tick} textAnchor="middle">
                  {b.label}
                </text>
              )}
            </g>
          )
        })}
        <line
          x1={PAD.left}
          x2={width - PAD.right}
          y1={PAD.top + innerH}
          y2={PAD.top + innerH}
          className={styles.axis}
        />
      </svg>
      <Tooltip tip={tip} width={width} />
    </div>
  )
}

function tipFor(
  b: StackBucket,
  total: number,
  colors: Map<string, string>,
  seriesLabel: ((k: string) => string) | undefined,
  format: (v: number) => string
): React.JSX.Element {
  const segs = [...b.segments].filter((s) => s.value > 0).sort((a, c) => c.value - a.value)
  return (
    <div>
      <div className={styles.tipTitle}>
        {b.label} · <b>{format(total)}</b>
      </div>
      {segs.length === 0 && <div className={styles.tipRow}>Sin uso</div>}
      {segs.map((s) => (
        <div key={s.key} className={styles.tipRow}>
          <span className={styles.swatch} style={{ background: colors.get(s.key) ?? '#6b6b70' }} />
          <span className={styles.tipLabel}>{seriesLabel ? seriesLabel(s.key) : s.key}</span>
          <span className={styles.tipValue}>{format(s.value)}</span>
        </div>
      ))}
    </div>
  )
}
