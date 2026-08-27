import { describe, expect, it } from 'vitest'
import { ErrorLog } from './error-log'

describe('ErrorLog', () => {
  it('keeps the last N, newest first, ignores blanks, truncates', () => {
    let t = 0
    const log = new ErrorLog(3, () => ++t)
    log.push('a', 'uno')
    log.push('b', new Error('dos'))
    log.push('c', '   ')
    log.push('d', 'tres')
    log.push('e', 'x'.repeat(2000))
    expect(log.list().map((e) => e.source)).toEqual(['e', 'd', 'b'])
    expect(log.list()[0]!.message).toHaveLength(1000)
    expect(log.list()[2]).toEqual({ ts: 2, source: 'b', message: 'dos' })
    log.clear()
    expect(log.list()).toEqual([])
  })
})
