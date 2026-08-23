import { describe, expect, it } from 'vitest'
import { niceTicks } from './ticks'

describe('niceTicks', () => {
  it('produces clean steps covering 0..max', () => {
    expect(niceTicks(0, 4)).toEqual([0])
    expect(niceTicks(97, 4)).toEqual([0, 25, 50, 75])
    expect(niceTicks(1_234_567, 4)).toEqual([0, 500000, 1000000])
    expect(niceTicks(7, 4)).toEqual([0, 2, 4, 6])
    expect(niceTicks(0.9, 4)).toEqual([0, 0.25, 0.5, 0.75])
  })
})
