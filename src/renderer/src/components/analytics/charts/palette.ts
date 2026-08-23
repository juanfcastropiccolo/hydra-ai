// Feature 005: chart colors. Categorical slots validated for the dark surface (#1c1c1e) with the
// dataviz validator (CVD ΔE ≥ 8 adjacent, contrast ≥ 3:1). Color follows the entity: colors are
// assigned by a stable sorted key list, never by rank or by filter order.

/** Dark-surface categorical palette, in validated order. Max 8; extra entities fold into OTHER. */
export const CATEGORICAL = [
  '#3987e5', // blue
  '#d95926', // orange
  '#199e70', // aqua
  '#c98500', // yellow
  '#d55181', // magenta
  '#008300', // green
  '#9085e9', // violet
  '#e66767' // red
] as const
export const OTHER_COLOR = '#6b6b70'
export const OTHER_KEY = '__other__'

/** Sequential ramp (single hue — Hydra green), surface → accent. */
export const SEQUENTIAL = [
  '#1f2b24',
  '#1f4230',
  '#21593c',
  '#247349',
  '#2b8f57',
  '#34ab66',
  '#4ade80'
] as const

export type ColorMap = Map<string, string>

/** Stable assignment: keys sorted (case-insensitive) get slots in order; beyond 8 → OTHER_COLOR. */
export function assignColors(keys: Iterable<string>): ColorMap {
  const sorted = [...new Set(keys)].sort((a, b) =>
    a.localeCompare(b, 'en', { sensitivity: 'base' })
  )
  const m: ColorMap = new Map()
  sorted.forEach((k, i) => m.set(k, i < CATEGORICAL.length ? CATEGORICAL[i]! : OTHER_COLOR))
  return m
}

export function colorOf(m: ColorMap, key: string): string {
  return m.get(key) ?? OTHER_COLOR
}

/** 0..1 → sequential step (0 = near-surface). */
export function sequential(t: number): string {
  if (!(t > 0)) return SEQUENTIAL[0]!
  const i = Math.min(SEQUENTIAL.length - 1, Math.max(1, Math.ceil(t * (SEQUENTIAL.length - 1))))
  return SEQUENTIAL[i]!
}

/** Short display name for a model id: 'claude-haiku-4-5-20251001' → 'Haiku 4.5'. */
export function modelLabel(model: string): string {
  const m = /^claude-(fable|mythos|opus|sonnet|haiku)-(\d+)(?:-(\d+))?/i.exec(model)
  if (!m) return model
  const name = m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1).toLowerCase()
  return m[3] ? `${name} ${m[2]}.${m[3]}` : `${name} ${m[2]}`
}
