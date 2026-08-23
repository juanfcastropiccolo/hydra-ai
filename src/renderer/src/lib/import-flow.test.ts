import { describe, expect, it } from 'vitest'
import { cleanIpcMessage } from './import-flow'

describe('cleanIpcMessage', () => {
  it('strips the Electron IPC prefix', () => {
    expect(
      cleanIpcMessage(
        "Error invoking remote method 'context.summarize': Error: La sesión origen ya no existe"
      )
    ).toBe('La sesión origen ya no existe')
    expect(
      cleanIpcMessage("Error invoking remote method 'context.summarize': ClaudeCliError: bad model")
    ).toBe('bad model')
    expect(cleanIpcMessage('plain')).toBe('plain')
  })
})
