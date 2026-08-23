// Feature 005 FR-9: default USD prices per million tokens, by model family. Cache write = 1.25×
// input, cache read = 0.1× input (standard ephemeral cache). Snapshot of the public Anthropic API
// price list as of 2026-06-24 — edit via hydra.json → ui.analytics.pricing (overrides win).
import type { ModelPricing } from './types'

export const PRICING_SNAPSHOT_DATE = '2026-06-24'

const p = (input: number, output: number): ModelPricing => ({
  input,
  output,
  cacheWrite: +(input * 1.25).toFixed(4),
  cacheRead: +(input * 0.1).toFixed(4)
})

/** Keys are matched as prefixes of the model id (longest wins), so dated ids still resolve. */
export const DEFAULT_PRICING: Record<string, ModelPricing> = {
  'claude-fable-5': p(10, 50),
  'claude-mythos-5': p(10, 50),
  'claude-opus-5': p(5, 25),
  'claude-opus-4-8': p(5, 25),
  'claude-opus-4-7': p(5, 25),
  'claude-opus-4-6': p(5, 25),
  'claude-opus-4-5': p(5, 25),
  'claude-opus-4-1': p(15, 75),
  'claude-opus-4': p(15, 75),
  'claude-sonnet-5': p(3, 15),
  'claude-sonnet-4-6': p(3, 15),
  'claude-sonnet-4-5': p(3, 15),
  'claude-sonnet-4': p(3, 15),
  'claude-haiku-4-5': p(1, 5),
  'claude-3-5-haiku': p(0.8, 4),
  'claude-3-7-sonnet': p(3, 15)
}

/**
 * Price for `model`: exact override > longest-prefix override > longest-prefix default > null.
 * Matching is case-insensitive and ignores a leading provider prefix (`anthropic.`, `us.anthropic.`).
 */
export function resolvePricing(
  model: string,
  overrides: Record<string, ModelPricing> = {}
): ModelPricing | null {
  const id = model.toLowerCase().replace(/^(?:[a-z]+\.)*anthropic\./, '')
  if (overrides[model]) return overrides[model]
  const pick = (table: Record<string, ModelPricing>): ModelPricing | null => {
    let best: { len: number; price: ModelPricing } | null = null
    for (const [key, price] of Object.entries(table)) {
      const k = key.toLowerCase()
      if ((id === k || id.startsWith(k)) && (!best || k.length > best.len))
        best = { len: k.length, price }
    }
    return best?.price ?? null
  }
  return pick(overrides) ?? pick(DEFAULT_PRICING)
}
