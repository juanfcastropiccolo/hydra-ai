// Hour × weekday heatmap (7 rows × 24 cols), sequential single-hue fill, per-cell tooltip.
import { dowLabel, hourLabel } from '../formatters'
import styles from './charts.module.css'
import { sequential } from './palette'
import { useContainerWidth, useTooltip } from './hooks'
import { Tooltip } from './Tooltip'

export function Heatmap({
  grid,
  max,
  format,
  testId
}: {
  /** [dow 0-6][hour 0-23] */
  grid: number[][]
  max: number
  format: (v: number) => string
  testId?: string
}): React.JSX.Element {
  const [ref, width] = useContainerWidth()
  const { tip, show, hide } = useTooltip()
  const left = 34
  const top = 16
  const cellGap = 2
  const cols = 24
  const cellW = Math.max(6, (width - left - 4 - cellGap * (cols - 1)) / cols)
  const cellH = Math.min(18, Math.max(10, cellW))
  const height = top + 7 * (cellH + cellGap) + 4
  const order = [1, 2, 3, 4, 5, 6, 0] // Mon..Sun
  return (
    <div className={styles.chart} data-chart data-testid={testId} ref={ref}>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Actividad por hora y día"
      >
        {Array.from({ length: cols }, (_, h) =>
          h % 3 === 0 ? (
            <text key={h} x={left + h * (cellW + cellGap)} y={top - 5} className={styles.tick}>
              {hourLabel(h)}
            </text>
          ) : null
        )}
        {order.map((dow, ri) => (
          <g key={dow}>
            <text
              x={left - 6}
              y={top + ri * (cellH + cellGap) + cellH / 2 + 3}
              className={styles.tick}
              textAnchor="end"
            >
              {dowLabel(dow)}
            </text>
            {Array.from({ length: cols }, (_, h) => {
              const v = grid[dow]?.[h] ?? 0
              const t = max > 0 ? v / max : 0
              return (
                <rect
                  key={h}
                  x={left + h * (cellW + cellGap)}
                  y={top + ri * (cellH + cellGap)}
                  width={cellW}
                  height={cellH}
                  rx={3}
                  fill={sequential(t)}
                  className={styles.cell}
                  data-value={v}
                  onMouseEnter={(e) =>
                    show(
                      e,
                      <div>
                        <div className={styles.tipTitle}>
                          {dowLabel(dow)} {hourLabel(h)}–{hourLabel((h + 1) % 24)}
                        </div>
                        <div className={styles.tipRow}>
                          <span className={styles.tipValue}>{format(v)}</span>
                        </div>
                      </div>
                    )
                  }
                  onMouseLeave={hide}
                />
              )
            })}
          </g>
        ))}
      </svg>
      <Tooltip tip={tip} width={width} />
    </div>
  )
}
