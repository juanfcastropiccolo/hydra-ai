import { describe, expect, it } from 'vitest'
import { addTokenCounts, costOf, costOfTokens, totalTokens } from './cost'
import { DEFAULT_PRICING, resolvePricing } from './pricing'

describe('resolvePricing', () => {
  it('matches families by longest prefix, tolerates dated ids and provider prefixes', () => {
    expect(resolvePricing('claude-haiku-4-5-20251001')).toEqual(DEFAULT_PRICING['claude-haiku-4-5'])
    expect(resolvePricing('claude-opus-5')).toEqual(DEFAULT_PRICING['claude-opus-5'])
    expect(resolvePricing('claude-opus-4-8')?.input).toBe(5)
    expect(resolvePricing('claude-opus-4-1-20250805')?.input).toBe(15) // not the 'claude-opus-4' family
    expect(resolvePricing('us.anthropic.claude-sonnet-4-6-v1')?.output).toBe(15)
    expect(resolvePricing('CLAUDE-FABLE-5')?.input).toBe(10)
    expect(resolvePricing('gpt-9')).toBeNull()
    expect(resolvePricing('unknown')).toBeNull()
  })
  it('overrides win: exact, then prefix', () => {
    const o = {
      'claude-opus-5': { input: 1, output: 2, cacheWrite: 3, cacheRead: 4 },
      mine: { input: 9, output: 9, cacheWrite: 9, cacheRead: 9 }
    }
    expect(resolvePricing('claude-opus-5', o)?.input).toBe(1)
    expect(resolvePricing('mine-v2', o)?.input).toBe(9)
    expect(resolvePricing('claude-haiku-4-5', o)?.input).toBe(1) // default still applies
  })
  it('defaults derive cache prices from input', () => {
    expect(DEFAULT_PRICING['claude-opus-5']).toEqual({
      input: 5,
      output: 25,
      cacheWrite: 6.25,
      cacheRead: 0.5
    })
  })
})

describe('costOf', () => {
  it('sums per model and reports unknown models', () => {
    const r = costOf({
      'claude-opus-5': {
        input: 1_000_000,
        output: 100_000,
        cacheWrite: 200_000,
        cacheRead: 2_000_000
      },
      'claude-haiku-4-5-20251001': { input: 0, output: 1_000_000, cacheWrite: 0, cacheRead: 0 },
      mystery: { input: 5, output: 5, cacheWrite: 5, cacheRead: 5 }
    })
    // opus: 5 + 2.5 + 1.25 + 1.0 = 9.75 ; haiku: 5
    expect(r.usd).toBeCloseTo(14.75, 6)
    expect(r.unknownModels).toEqual(['mystery'])
    expect(
      costOfTokens(
        { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 },
        DEFAULT_PRICING['claude-opus-5']!
      )
    ).toBe(0)
  })
  it('token helpers', () => {
    expect(totalTokens({ input: 1, output: 2, cacheWrite: 3, cacheRead: 4 })).toBe(10)
    expect(
      addTokenCounts(
        { input: 1, output: 2, cacheWrite: 3, cacheRead: 4 },
        { input: 1, output: 1, cacheWrite: 1, cacheRead: 1 }
      )
    ).toEqual({ input: 2, output: 3, cacheWrite: 4, cacheRead: 5 })
  })
})
