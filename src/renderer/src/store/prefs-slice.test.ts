import { describe, expect, it } from 'vitest'
import { defaultPrefs } from '@shared/prefs'
import { createPrefsStore } from './prefs-slice'

describe('prefs store', () => {
  it('starts with defaults and is replaced wholesale', () => {
    const st = createPrefsStore()
    expect(st.getState().loaded).toBe(false)
    expect(st.getState().prefs.appearance.terminalFontSize).toBe(13)
    const p = { ...defaultPrefs('ana'), zoomLevel: 1 }
    st.getState().setPrefs(p)
    expect(st.getState()).toMatchObject({
      loaded: true,
      prefs: { zoomLevel: 1, profile: { name: 'Ana' } }
    })
  })
})
