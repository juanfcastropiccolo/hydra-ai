import { describe, expect, it } from 'vitest'
import { layout } from './force-layout'

describe('force layout', () => {
  const nodes = Array.from({ length: 60 }, (_, i) => ({ id: `n${i}`, weight: (i % 5) + 1 }))
  const edges = nodes.slice(1).map((n, i) => ({ a: `n${Math.floor(i / 3)}`, b: n.id, w: 1 }))
  it('is deterministic, finite and inside bounds', () => {
    const p1 = layout(nodes, edges, { width: 800, height: 600 })
    const p2 = layout(nodes, edges, { width: 800, height: 600 })
    expect(p1.size).toBe(60)
    for (const [id, p] of p1) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true)
      expect(p.x).toBeGreaterThanOrEqual(20)
      expect(p.y).toBeLessThanOrEqual(580)
      expect(p2.get(id)).toEqual(p)
    }
  })
  it('connected nodes end closer than the average pair', () => {
    const p = layout(nodes, edges, { width: 800, height: 600 })
    const dist = (a: string, b: string): number => {
      const pa = p.get(a)!
      const pb = p.get(b)!
      return Math.hypot(pa.x - pb.x, pa.y - pb.y)
    }
    const connected = edges.slice(0, 40).reduce((s, e) => s + dist(e.a, e.b), 0) / 40
    let all = 0
    let c = 0
    for (let i = 0; i < 30; i++)
      for (let j = i + 1; j < 30; j++) {
        all += dist(`n${i}`, `n${j}`)
        c++
      }
    expect(connected).toBeLessThan(all / c)
  })
  it('keeps previous positions as seeds and handles empty input', () => {
    expect(layout([], [], { width: 100, height: 100 }).size).toBe(0)
    const prev = layout(nodes, edges, { width: 800, height: 600 })
    const p = layout(nodes.slice(0, 10), [], { width: 800, height: 600, iterations: 0, prev })
    expect(p.get('n0')).toEqual(prev.get('n0'))
  })
})
