// Feature 004: the renderer-side orchestration of one import (dialog pick → summary → store).
// The paste itself lives in Pane (it owns ptyId + focus); this file only drives the store.
import type { Session } from '@shared/types'
import { hydra } from './hydra-client'
import { importContextStore } from '../store/import-context-slice'

const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`

/** Start (or retry) importing `source` into `target`. No-op if one is already running there. */
export async function runImport(
  target: string,
  source: Pick<Session, 'sessionId' | 'name'>
): Promise<void> {
  const st = importContextStore.getState()
  const importId = newId()
  if (
    !st.startImport(target, {
      importId,
      sourceSessionId: source.sessionId,
      sourceName: source.name
    })
  )
    return
  try {
    const r = await hydra.summarizeContext(importId, source.sessionId)
    importContextStore.getState().markReady(target, importId, r)
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e)
    if (/cancelled|ImportCancelledError/.test(msg)) return // user cancelled: store already cleared
    importContextStore.getState().markError(target, importId, cleanIpcMessage(msg))
  }
}

/** Cancel a running import for `target` (tells main to abort, forgets the state). */
export async function cancelImport(target: string): Promise<void> {
  const cur = importContextStore.getState().get(target)
  if (!cur) return
  importContextStore.getState().clear(target)
  if (cur.phase === 'running') await hydra.cancelImport(cur.importId).catch(() => {})
}

/** Electron prefixes IPC rejections with "Error invoking remote method '…': Error: "; strip it. */
export function cleanIpcMessage(msg: string): string {
  return msg.replace(/^Error invoking remote method '[^']*':\s*(Error:\s*)?/, '').trim()
}
