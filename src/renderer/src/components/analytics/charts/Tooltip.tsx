// Lightweight hover tooltip: positioned inside the chart's relative container.
import styles from './charts.module.css'
import type { TooltipState } from './hooks'

export function Tooltip({
  tip,
  width
}: {
  tip: TooltipState | null
  width: number
}): React.JSX.Element | null {
  if (!tip) return null
  const flip = tip.x > width * 0.6
  return (
    <div
      className={styles.tooltip}
      style={{
        left: tip.x + (flip ? -12 : 12),
        top: tip.y - 8,
        transform: flip ? 'translateX(-100%)' : undefined
      }}
      role="tooltip"
    >
      {tip.content}
    </div>
  )
}
