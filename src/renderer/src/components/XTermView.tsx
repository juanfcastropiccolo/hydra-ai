// One xterm.js instance bound to one PTY (claude attach). Owns:
//  - data in/out over IPC, resize via ResizeObserver → fit → pty.resize
//  - FOCUS TRUTH: the store's focusedSessionId is set ONLY from this terminal's textarea
//    focus/blur events (Constitution principle 3). The pane's border derives from the store.
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { useEffect, useRef } from 'react'
import { hydra } from '../lib/hydra-client'
import { appStore } from '../store/app-store'
import { prefsStore, usePrefs } from '../store/prefs-slice'
import styles from './XTermView.module.css'

export interface XTermController {
  focus(): void
  clearSelection(): void
  fit(): void
}

export interface XTermViewProps {
  sessionId: string
  ptyId: string
  /** Called when the attach client exits (session stopped/killed). */
  onExit?: (exitCode: number) => void
  /** Receives an imperative controller once the terminal is mounted (null on unmount). */
  controllerRef?: React.RefObject<XTermController | null>
}

const RESIZE_DEBOUNCE_MS = 50

export function XTermView({
  sessionId,
  ptyId,
  onExit,
  controllerRef
}: XTermViewProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  // Feature 007: font size changes apply live (no re-attach): xterm re-measures on option change.
  const fontSize = usePrefs((p) => p.appearance.terminalFontSize)
  useEffect(() => {
    const term = termRef.current
    if (!term || term.options.fontSize === fontSize) return
    term.options.fontSize = fontSize
    try {
      fitRef.current?.fit()
      hydra.resize(ptyId, term.cols, term.rows)
    } catch {
      /* not laid out */
    }
  }, [fontSize, ptyId])
  const onExitRef = useRef(onExit)
  useEffect(() => {
    onExitRef.current = onExit
  }, [onExit])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const term = new Terminal({
      cursorBlink: true,
      fontSize: prefsStore.getState().prefs.appearance.terminalFontSize,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace',
      scrollback: 5000,
      allowProposedApi: true,
      macOptionIsMeta: true,
      theme: { background: '#121214' }
    })
    const fit = new FitAddon()
    fitRef.current = fit
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon())
    term.open(host)
    termRef.current = term

    // Focus truth → store
    const ta = term.textarea
    const onFocus = (): void => appStore.getState().focus(sessionId)
    const onBlur = (): void => appStore.getState().blur(sessionId)
    ta?.addEventListener('focus', onFocus)
    ta?.addEventListener('blur', onBlur)

    // Keystrokes → PTY (only this pane's pty; a blurred terminal never receives onData)
    const dataSub = term.onData((d) => hydra.write(ptyId, d))

    // PTY → terminal
    const offData = hydra.onPtyData((e) => {
      if (e.ptyId === ptyId) term.write(e.data)
    })
    const offExit = hydra.onPtyExit((e) => {
      if (e.ptyId === ptyId) onExitRef.current?.(e.exitCode)
    })

    // Replay whatever the main process buffered (remount / re-show)
    void hydra.scrollback(ptyId).then((buf) => {
      if (buf) term.write(buf)
    })

    // Size
    let timer: ReturnType<typeof setTimeout> | null = null
    const doFit = (): void => {
      if (!host.isConnected || host.clientWidth === 0 || host.clientHeight === 0) return
      try {
        fit.fit()
        hydra.resize(ptyId, term.cols, term.rows)
      } catch {
        /* host not laid out yet */
      }
    }
    const ro = new ResizeObserver(() => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(doFit, RESIZE_DEBOUNCE_MS)
    })
    ro.observe(host)
    doFit()
    if (appStore.getState().focusedSessionId === sessionId) term.focus()
    if (controllerRef) {
      controllerRef.current = {
        focus: () => term.focus(),
        clearSelection: () => term.clearSelection(),
        fit: doFit
      }
    }

    return () => {
      ro.disconnect()
      if (timer) clearTimeout(timer)
      ta?.removeEventListener('focus', onFocus)
      ta?.removeEventListener('blur', onBlur)
      dataSub.dispose()
      offData()
      offExit()
      term.dispose()
      termRef.current = null
      if (controllerRef) controllerRef.current = null
      appStore.getState().blur(sessionId)
    }
  }, [sessionId, ptyId, controllerRef])

  // Parent (Pane) calls focus via mousedown on the whole pane; expose through a data attribute hook.
  return (
    <div
      ref={hostRef}
      className={styles.host}
      data-font-size={fontSize}
      data-testid="xterm-host"
      data-session-id={sessionId}
      onMouseDown={() => termRef.current?.focus()}
    />
  )
}
