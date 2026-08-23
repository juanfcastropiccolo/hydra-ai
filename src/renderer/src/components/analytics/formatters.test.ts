import { describe, expect, it } from 'vitest'
import { assignColors, CATEGORICAL, modelLabel, OTHER_COLOR, sequential } from './charts/palette'
import { fmtDayKey, fmtDuration, fmtPct, fmtTokens, fmtUsd } from './formatters'

describe('formatters', () => {
  it('tokens', () => {
    expect(fmtTokens(0)).toBe('0')
    expect(fmtTokens(999)).toBe('999')
    expect(fmtTokens(1500)).toBe('1.5k')
    expect(fmtTokens(12_345)).toBe('12k')
    expect(fmtTokens(1_234_567)).toBe('1.23M')
    expect(fmtTokens(45_000_000)).toBe('45M')
    expect(fmtTokens(2_500_000_000)).toBe('2.5B')
  })
  it('usd', () => {
    expect(fmtUsd(0)).toBe('$0')
    expect(fmtUsd(0.004)).toBe('<$0.01')
    expect(fmtUsd(0.42)).toBe('$0.42')
    expect(fmtUsd(12.345)).toBe('$12.35')
    expect(fmtUsd(250.7)).toBe('$251')
    expect(fmtUsd(12_345)).toBe('$12,345')
    expect(fmtUsd(null)).toBe('—')
  })
  it('duration / pct / day', () => {
    expect(fmtDuration(45_000)).toBe('45s')
    expect(fmtDuration(5 * 60_000)).toBe('5m')
    expect(fmtDuration(125 * 60_000)).toBe('2h 5m')
    expect(fmtDuration(30 * 3_600_000)).toBe('1d 6h')
    expect(fmtPct(12.34)).toBe('+12%')
    expect(fmtPct(-3.21)).toBe('-3.2%')
    expect(fmtPct(null)).toBe('—')
    expect(fmtDayKey('2026-08-23')).toBe('23 ago')
  })
})

describe('palette', () => {
  it('assigns colors by sorted key, stable under filtering, folds past 8', () => {
    const m = assignColors(['claude-opus-5', 'claude-haiku-4-5', 'claude-fable-5'])
    expect(m.get('claude-fable-5')).toBe(CATEGORICAL[0])
    expect(m.get('claude-haiku-4-5')).toBe(CATEGORICAL[1])
    expect(m.get('claude-opus-5')).toBe(CATEGORICAL[2])
    const many = assignColors(
      Array.from({ length: 10 }, (_, i) => `m${String(i).padStart(2, '0')}`)
    )
    expect(many.get('m09')).toBe(OTHER_COLOR)
    expect(sequential(0)).toBe('#1f2b24')
    expect(sequential(1)).toBe('#4ade80')
    expect(modelLabel('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
    expect(modelLabel('claude-opus-5')).toBe('Opus 5')
    expect(modelLabel('gpt-x')).toBe('gpt-x')
  })
})
