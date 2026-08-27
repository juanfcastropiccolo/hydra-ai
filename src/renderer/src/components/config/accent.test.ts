import { describe, expect, it } from 'vitest'
import { ACCENT_VARS, applyAccent } from './accent'

describe('applyAccent', () => {
  it('sets --accent/--accent-dim for every palette color and falls back to green', () => {
    const set: Record<string, string> = {}
    const root = { style: { setProperty: (k: string, v: string) => void (set[k] = v) } }
    applyAccent('violet', root)
    expect(set).toEqual({
      '--accent': ACCENT_VARS.violet.accent,
      '--accent-dim': ACCENT_VARS.violet.dim
    })
    applyAccent('nope' as never, root)
    expect(set['--accent']).toBe(ACCENT_VARS.green.accent)
    expect(Object.keys(ACCENT_VARS)).toHaveLength(8)
  })
})
