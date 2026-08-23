// Feature 004: state of "import context" per target pane. Separate vanilla store (same pattern as
// file-tree-slice) so it is testable without React and survives Pane mount/unmount (hide/show).
// Invariant: at most one import per target session; the paste itself happens in Pane (it owns the
// ptyId and the focus controller) only when the target is still idle.
import { createStore, useStore, type StoreApi } from 'zustand'

export type ImportPhase = 'running' | 'ready' | 'blocked' | 'done' | 'error'

export interface ImportState {
  importId: string
  sourceSessionId: string
  sourceName: string
  phase: ImportPhase
  /** Full block to paste (set on ready/blocked/done). */
  text?: string
  truncated?: boolean
  model?: string
  error?: string
}

export interface ImportContextState {
  /** Target session whose "choose a source" dialog is open, or null. */
  dialogTargetId: string | null
  byTarget: Record<string, ImportState>

  openDialog(targetSessionId: string): void
  closeDialog(): void
  /** Registers a running import. Returns false (and does nothing) if one is already running for that target. */
  startImport(
    target: string,
    src: { importId: string; sourceSessionId: string; sourceName: string }
  ): boolean
  markReady(
    target: string,
    importId: string,
    r: { text: string; truncated: boolean; model: string }
  ): void
  /** Target was not idle when the text arrived: keep the text, let the user copy/retry (FR-12). */
  markBlocked(target: string): void
  markDone(target: string): void
  markError(target: string, importId: string, error: string): void
  /** Cancelled or dismissed: forget the import for that target. */
  clear(target: string): void
  /** From 'blocked'/'done' back to 'ready' so Pane re-evaluates the idle guard and pastes again. */
  retryPaste(target: string): void
  get(target: string): ImportState | undefined
}

export function createImportContextStore(): StoreApi<ImportContextState> {
  return createStore<ImportContextState>((set, get) => ({
    dialogTargetId: null,
    byTarget: {},

    openDialog: (t) => set({ dialogTargetId: t }),
    closeDialog: () => set({ dialogTargetId: null }),

    startImport: (target, src) => {
      const cur = get().byTarget[target]
      if (cur?.phase === 'running') return false
      set((s) => ({
        dialogTargetId: s.dialogTargetId === target ? null : s.dialogTargetId,
        byTarget: { ...s.byTarget, [target]: { ...src, phase: 'running' } }
      }))
      return true
    },
    markReady: (target, importId, r) =>
      set((s) => {
        const cur = s.byTarget[target]
        if (!cur || cur.importId !== importId || cur.phase !== 'running') return {} // stale
        return { byTarget: { ...s.byTarget, [target]: { ...cur, phase: 'ready', ...r } } }
      }),
    markBlocked: (target) =>
      set((s) => {
        const cur = s.byTarget[target]
        if (!cur || cur.phase !== 'ready') return {}
        return { byTarget: { ...s.byTarget, [target]: { ...cur, phase: 'blocked' } } }
      }),
    markDone: (target) =>
      set((s) => {
        const cur = s.byTarget[target]
        if (!cur || cur.phase !== 'ready') return {}
        return { byTarget: { ...s.byTarget, [target]: { ...cur, phase: 'done' } } }
      }),
    markError: (target, importId, error) =>
      set((s) => {
        const cur = s.byTarget[target]
        if (!cur || cur.importId !== importId || cur.phase !== 'running') return {}
        return { byTarget: { ...s.byTarget, [target]: { ...cur, phase: 'error', error } } }
      }),
    clear: (target) =>
      set((s) => {
        if (!s.byTarget[target]) return {}
        const next = { ...s.byTarget }
        delete next[target]
        return { byTarget: next }
      }),
    retryPaste: (target) =>
      set((s) => {
        const cur = s.byTarget[target]
        if (!cur || (cur.phase !== 'blocked' && cur.phase !== 'done') || !cur.text) return {}
        return { byTarget: { ...s.byTarget, [target]: { ...cur, phase: 'ready' } } }
      }),
    get: (target) => get().byTarget[target]
  }))
}

export const importContextStore = createImportContextStore()
export function useImportContext<T>(selector: (s: ImportContextState) => T): T {
  return useStore(importContextStore, selector)
}
