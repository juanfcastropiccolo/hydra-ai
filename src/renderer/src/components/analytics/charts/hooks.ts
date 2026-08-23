// Shared hooks for the chart primitives (kept out of component files for fast-refresh).
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

/** Width of a container element, updated by ResizeObserver. */
export function useContainerWidth(initial = 600): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(initial)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = (): void => {
      const w = Math.round(el.clientWidth)
      if (w > 0) setWidth((prev) => (prev === w ? prev : w))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}

export interface TooltipState {
  x: number
  y: number
  content: ReactNode
}

export function useTooltip(): {
  tip: TooltipState | null
  show: (e: React.MouseEvent, content: ReactNode) => void
  hide: () => void
} {
  const [tip, setTip] = useState<TooltipState | null>(null)
  const show = useCallback((e: React.MouseEvent, content: ReactNode) => {
    const host = (e.currentTarget as Element).closest('[data-chart]') as HTMLElement | null
    const r = host?.getBoundingClientRect()
    setTip({ x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0), content })
  }, [])
  const hide = useCallback(() => setTip(null), [])
  return { tip, show, hide }
}
