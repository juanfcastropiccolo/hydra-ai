import { describe, expect, it } from 'vitest'
import {
  defaultPrefs,
  deriveInitials,
  prettifyUserName,
  renderNamePattern,
  validateAppearance,
  validateProfile,
  validatePrefs,
  validateSessions
} from './prefs'

describe('prefs helpers', () => {
  it('names and initials', () => {
    expect(prettifyUserName('juanfcastropiccolo')).toBe('Juanfcastropiccolo')
    expect(prettifyUserName('juan.castro-piccolo')).toBe('Juan Castro Piccolo')
    expect(deriveInitials('Juan Castro')).toBe('JC')
    expect(deriveInitials('Juan')).toBe('JU')
    expect(deriveInitials('Ana Belén de la Torre')).toBe('ABD')
    expect(deriveInitials('')).toBe('?')
    expect(
      renderNamePattern('{project}-{n} {date}', { project: 'hydra', n: 3, date: '2026-08-26' })
    ).toBe('hydra-3 2026-08-26')
  })
  it('section validators keep the base on bad input', () => {
    const base = defaultPrefs('x')
    expect(validateProfile({ name: '  ', initials: 'ABCD' }, base.profile)).toEqual(base.profile)
    expect(validateProfile({ name: 'Zoe', initials: 'zz' }, base.profile)).toEqual({
      name: 'Zoe',
      initials: 'ZZ'
    })
    expect(validateAppearance({ terminalFontSize: 9 }, base.appearance).terminalFontSize).toBe(13)
    expect(
      validateAppearance({ terminalFontSize: 19.6, accent: 'violet' }, base.appearance)
    ).toEqual({ terminalFontSize: 20, accent: 'violet' })
    expect(
      validateSessions({ permissionMode: 'bypassPermissions', effort: 'max' }, base.sessions)
    ).toMatchObject({ permissionMode: 'bypassPermissions', effort: 'max' })
    expect(validateSessions({ namePattern: '{project}' }, base.sessions).namePattern).toBe(
      '{project}-{n}'
    ) // needs {n}
  })
  it('validatePrefs over a raw file object and over a patch', () => {
    const base = defaultPrefs()
    const full = validatePrefs(
      { centerView: 'config', zoomLevel: 0.75, know: { port: 5000 } },
      base
    )
    expect(full).toMatchObject({
      centerView: 'config',
      zoomLevel: 1,
      know: { autoCards: true, port: 5000 }
    })
    expect(full.profile).toEqual(base.profile)
    const patched = validatePrefs({ analytics: { range: '30d' } }, full)
    expect(patched.analytics).toEqual({ range: '30d', pricing: {} })
    expect(patched.know.port).toBe(5000) // untouched sections carried over
  })
})
