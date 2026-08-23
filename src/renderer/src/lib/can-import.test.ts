import { describe, expect, it } from 'vitest'
import { canImportInto } from './can-import'

describe('canImportInto', () => {
  const base = { ptyId: 'p1', ended: false, importRunning: false }
  it('allows idle sessions with a terminal and no import running', () => {
    expect(canImportInto({ ...base, session: { state: 'idle' } })).toEqual({ ok: true })
  })
  it('explains each refusal', () => {
    expect(canImportInto({ ...base, session: { state: 'working' } })).toMatchObject({
      ok: false,
      reason: /trabajando/
    })
    expect(
      canImportInto({ ...base, session: { state: 'waiting', waitingFor: 'permission prompt' } })
    ).toMatchObject({ ok: false, reason: /esperando una respuesta tuya \(permission prompt\)/ })
    expect(canImportInto({ ...base, session: { state: 'waiting' } })).toMatchObject({
      reason: 'La sesión está esperando una respuesta tuya'
    })
    expect(canImportInto({ ...base, ended: true, session: { state: 'idle' } })).toMatchObject({
      reason: /finalizó/
    })
    expect(canImportInto({ ...base, ptyId: undefined, session: { state: 'idle' } })).toMatchObject({
      reason: /terminal todavía no/
    })
    expect(
      canImportInto({ ...base, importRunning: true, session: { state: 'idle' } })
    ).toMatchObject({
      reason: /importación en curso/
    })
    expect(canImportInto({ ...base, session: { state: 'ended' } })).toMatchObject({ ok: false })
  })
})
