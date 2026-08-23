import type { SessionState } from '@shared/types'
import type { AgentEntry } from './agents-json'

export interface MappedState {
  state: SessionState
  waitingFor?: string
  /** True when the CLI vocabulary was not recognised and we defaulted. */
  unknown?: boolean
}

/**
 * Traffic-light mapping. Pure. Decision table (see plan 001 §Semáforo):
 *   status waiting                → waiting (🔴) regardless of state
 *   status working | busy         → working (🟢)
 *   state failed | stopped        → ended
 *   state done without pid        → ended   ("done" with a live pid = last turn finished; the
 *                                            session is still running → falls through to status)
 *   no pid (process gone)         → ended
 *   status idle                   → idle (🟡)   (incl. bg "state: blocked" w/o prompt)
 *   anything else                 → idle, flagged unknown
 */
export function mapSessionState(
  e: Pick<AgentEntry, 'status' | 'state' | 'pid' | 'waitingFor' | 'kind'>
): MappedState {
  const status = e.status?.toLowerCase()
  const state = e.state?.toLowerCase()

  if (status === 'waiting') return { state: 'waiting', waitingFor: e.waitingFor ?? 'unknown' }
  if (status === 'working' || status === 'busy') return { state: 'working' }
  if (state === 'failed' || state === 'stopped') return { state: 'ended' }
  if (e.pid === undefined) return { state: 'ended' } // incl. state 'done' once the process is gone
  if (status === 'idle') return { state: 'idle' }
  return { state: 'idle', unknown: true }
}
