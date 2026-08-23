// Feature 005 FR-9: estimated cost from token counts. Pure.
import { resolvePricing } from './pricing'
import type { ModelPricing, TokenCounts } from './types'

export interface CostResult {
  /** USD for the models that have a price. */
  usd: number
  /** Models (ids) that had no price; their tokens are not counted. */
  unknownModels: string[]
}

export function costOfTokens(t: TokenCounts, price: ModelPricing): number {
  return (
    (t.input * price.input +
      t.output * price.output +
      t.cacheWrite * price.cacheWrite +
      t.cacheRead * price.cacheRead) /
    1_000_000
  )
}

export function costOf(
  tokensByModel: Record<string, TokenCounts>,
  overrides: Record<string, ModelPricing> = {}
): CostResult {
  let usd = 0
  const unknownModels: string[] = []
  for (const [model, t] of Object.entries(tokensByModel)) {
    const price = resolvePricing(model, overrides)
    if (!price) {
      unknownModels.push(model)
      continue
    }
    usd += costOfTokens(t, price)
  }
  return { usd, unknownModels }
}

export const totalTokens = (t: TokenCounts): number =>
  t.input + t.output + t.cacheWrite + t.cacheRead

export function addTokenCounts(a: TokenCounts, b: TokenCounts): TokenCounts {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    cacheRead: a.cacheRead + b.cacheRead
  }
}
