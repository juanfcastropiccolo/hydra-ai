// Feature 004 FR-10: paste text into a Claude Code prompt without submitting it. Bracketed paste
// (mode 2004) makes the TUI treat the whole block as one paste, so newlines do not send. We never
// write '\r' here — sending is always the user's Enter.
export const BRACKETED_PASTE_START = '\x1b[200~'
export const BRACKETED_PASTE_END = '\x1b[201~'

export function bracketedPaste(text: string): string {
  const clean = text.replace(/\r\n?/g, '\n')
  return BRACKETED_PASTE_START + clean + BRACKETED_PASTE_END
}
