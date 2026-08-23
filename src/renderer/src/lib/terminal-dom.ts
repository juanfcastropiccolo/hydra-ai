/** Focus the xterm.js helper textarea inside a pane host element (used by Pane on mousedown). */
export function focusTerminalIn(host: HTMLElement | null): void {
  const ta = host?.querySelector<HTMLTextAreaElement>('textarea.xterm-helper-textarea')
  ta?.focus()
}
