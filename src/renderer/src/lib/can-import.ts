// Feature 004 FR-1: when may a pane receive an imported context? Pure, so the button state and
// the paste guard share one definition.
import type { Session } from '@shared/types'

export interface CanImportInput {
  session: Pick<Session, 'state' | 'waitingFor'>
  ptyId: string | undefined
  ended: boolean
  importRunning: boolean
}

export type CanImportResult = { ok: true } | { ok: false; reason: string }

export function canImportInto(i: CanImportInput): CanImportResult {
  if (i.ended) return { ok: false, reason: 'La sesión finalizó' }
  if (!i.ptyId) return { ok: false, reason: 'La terminal todavía no está conectada' }
  if (i.importRunning) return { ok: false, reason: 'Ya hay una importación en curso en este pane' }
  switch (i.session.state) {
    case 'idle':
      return { ok: true }
    case 'working':
      return { ok: false, reason: 'La sesión está trabajando; esperá a que termine' }
    case 'waiting':
      return {
        ok: false,
        reason: i.session.waitingFor
          ? `La sesión está esperando una respuesta tuya (${i.session.waitingFor})`
          : 'La sesión está esperando una respuesta tuya'
      }
    default:
      return { ok: false, reason: 'La sesión no está disponible' }
  }
}
