// Feature 007: renderer mirror of every preference (hydra.json → ui). Main is the source of truth;
// this slice is replaced wholesale on every prefs.changed and read by App (accent, avatar, fonts).
import { createStore, useStore, type StoreApi } from 'zustand'
import { defaultPrefs, type HydraPrefs } from '@shared/prefs'

export interface PrefsState {
  prefs: HydraPrefs
  loaded: boolean
  setPrefs(p: HydraPrefs): void
}

export function createPrefsStore(): StoreApi<PrefsState> {
  return createStore<PrefsState>((set) => ({
    prefs: defaultPrefs(),
    loaded: false,
    setPrefs: (prefs) => set({ prefs, loaded: true })
  }))
}

export const prefsStore = createPrefsStore()
export function usePrefs<T>(selector: (p: HydraPrefs) => T): T {
  return useStore(prefsStore, (s) => selector(s.prefs))
}
