// Feature 006 FR-14: the visual graph. SVG with our own force layout, zoom/pan, click to select,
// double-click to expand neighbours. Never a hairball: main caps what it sends (~120 nodes).
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useContainerWidth } from '../analytics/charts/hooks'
import type { GraphData } from '../../store/know-slice'
import { layout } from './force-layout'
import { KIND_COLOR, KIND_LABEL } from './node-kinds'
import styles from './know.module.css'

export function GraphCanvas({
  graph,
  highlight,
  selected,
  onSelect,
  onExpand,
  height = 480,
  panel
}: {
  graph: GraphData
  highlight: string[]
  selected: string | null
  onSelect: (id: string | null) => void
  onExpand: (id: string) => void
  height?: number
  /** Floating panel rendered next to the selected node (FR-14: details stay on the graph). */
  panel?: ReactNode
}): React.JSX.Element {
  const [ref, width] = useContainerWidth(800)
  // Deterministic layout (seeded by node ids): nodes keep familiar spots across expansions.
  const positions = useMemo(
    () => layout(graph.nodes, graph.edges, { width, height }),
    [graph, width, height]
  )

  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null)
  const hl = useMemo(() => new Set(highlight), [highlight])
  const dimmed = hl.size > 0

  const onWheel = (e: React.WheelEvent): void => {
    const k = Math.max(0.4, Math.min(3, view.k * (e.deltaY < 0 ? 1.1 : 0.9)))
    setView((v) => ({ ...v, k }))
  }
  const onMouseDown = (e: React.MouseEvent): void => {
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }
  }
  const onMouseMove = (e: React.MouseEvent): void => {
    if (!drag.current) return
    setView((v) => ({
      ...v,
      x: drag.current!.vx + (e.clientX - drag.current!.x),
      y: drag.current!.vy + (e.clientY - drag.current!.y)
    }))
  }
  const endDrag = (): void => {
    drag.current = null
  }

  const r = (w: number): number => 5 + Math.min(11, Math.log1p(w) * 2.4)
  // Anchor for the floating panel: the selected node's screen position (view transform applied).
  const anchor = useMemo(() => {
    if (!selected) return null
    const p = positions.get(selected)
    if (!p) return null
    const x = p.x * view.k + view.x
    const y = p.y * view.k + view.y
    const flip = x > width * 0.55
    return {
      left: flip ? undefined : Math.min(width - 320, x + 16),
      right: flip ? Math.max(0, width - x + 16) : undefined,
      top: Math.max(8, Math.min(height - 160, y - 20))
    }
  }, [selected, positions, view, width, height])

  return (
    <div ref={ref} className={styles.canvasWrap} data-testid="graph-canvas">
      <svg
        width="100%"
        height={height}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
        onClick={(e) => {
          if (e.target === e.currentTarget) onSelect(null)
        }}
        role="img"
        aria-label="Grafo de conocimiento"
      >
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          {graph.edges.map((e) => {
            const a = positions.get(e.a)
            const b = positions.get(e.b)
            if (!a || !b) return null
            const lit = !dimmed || (hl.has(e.a) && hl.has(e.b))
            return (
              <line
                key={`${e.a}→${e.b}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                className={lit ? styles.edge : styles.edgeDim}
                strokeWidth={Math.min(2.5, 0.6 + Math.log1p(e.w) * 0.5)}
              />
            )
          })}
          {graph.nodes.map((n) => {
            const p = positions.get(n.id)
            if (!p) return null
            const lit = !dimmed || hl.has(n.id)
            const rad = r(n.weight)
            return (
              <g
                key={n.id}
                transform={`translate(${p.x},${p.y})`}
                className={`${styles.node} ${lit ? '' : styles.nodeDim} ${selected === n.id ? styles.nodeSelected : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  onSelect(n.id)
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  onExpand(n.id)
                }}
                data-testid="graph-node"
                data-node-id={n.id}
                data-kind={n.kind}
              >
                {n.kind === 'project' ? (
                  <rect
                    x={-rad}
                    y={-rad}
                    width={rad * 2}
                    height={rad * 2}
                    rx={4}
                    fill={KIND_COLOR[n.kind]}
                  />
                ) : (
                  <circle r={rad} fill={KIND_COLOR[n.kind] ?? '#6b6b70'} />
                )}
                {(n.weight >= 3 || selected === n.id || (dimmed && lit)) && (
                  <text y={rad + 11} textAnchor="middle" className={styles.nodeLabel}>
                    {n.label.length > 24 ? n.label.slice(0, 23) + '…' : n.label}
                  </text>
                )}
                <title>
                  {KIND_LABEL[n.kind]}: {n.label}
                </title>
              </g>
            )
          })}
        </g>
      </svg>
      {panel && anchor && (
        <div
          className={styles.floatingPanel}
          style={{ left: anchor.left, right: anchor.right, top: anchor.top }}
          onMouseDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          data-testid="graph-panel"
        >
          {panel}
        </div>
      )}
      <div className={styles.canvasLegend}>
        {Object.entries(KIND_LABEL).map(([k, l]) => (
          <span key={k} className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: KIND_COLOR[k] }} />
            {l}
          </span>
        ))}
        <span className={styles.legendHint}>
          doble clic = expandir · rueda = zoom · arrastrar = mover
        </span>
      </div>
    </div>
  )
}
