import { describe, expect, it } from 'vitest'
import { bracketedPaste, BRACKETED_PASTE_END, BRACKETED_PASTE_START } from './paste'

describe('bracketedPaste', () => {
  it('wraps the text in ESC[200~ … ESC[201~ and never emits a carriage return', () => {
    const out = bracketedPaste('hola\r\nmundo\rfin\n')
    expect(out.startsWith(BRACKETED_PASTE_START)).toBe(true)
    expect(out.endsWith(BRACKETED_PASTE_END)).toBe(true)
    expect(out).toBe('\x1b[200~hola\nmundo\nfin\n\x1b[201~')
    expect(out).not.toContain('\r')
  })
})
