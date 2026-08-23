import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@shared/types'
import { hydra } from '../lib/hydra-client'
import { useAppStore } from '../store/app-store'
import styles from './Pane.module.css'
import { StatusLight } from './StatusLight'
import { XTermView, type XTermController } from './XTermView'

export function Pane({ session }: { session: Session }): React.JSX.Element {
  const focused = useAppStore((s) => s.focusedSessionId === session.sessionId)
  const expanded = useAppStore((s) => s.expandedSessionId === session.sessionId)
  const ptyId = useAppStore((s) => s.ptyIds[session.sessionId])
  const setPtyId = useAppStore((s) => s.setPtyId)
  const toggleExpand = useAppStore((s) => s.toggleExpand)
  const hide = useAppStore((s) => s.hide)
  const setError = useAppStore((s) => s.setError)
  const openDialog = useAppStore((s) => s.openNewSessionDialog)
  const controller = useRef<XTermController | null>(null)
  const [exitCode, setExitCode] = useState<number | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(session.name)
  const ended = session.state === 'ended' || exitCode !== null
  const attachable = Boolean(session.bgId)

  // PTY lifecycle: open on mount (attachable only), close on unmount/hide.
  useEffect(() => {
    if (!attachable) return
    let cancelled = false
    let opened: string | null = null
    void hydra
      .openPty(session.sessionId, 100, 30)
      .then(({ ptyId }) => {
        if (cancelled) return void hydra.closePty(ptyId)
        opened = ptyId
        setPtyId(session.sessionId, ptyId)
      })
      .catch((e: Error) => setError(e.message))
    return () => {
      cancelled = true
      if (opened) void hydra.closePty(opened)
      setPtyId(session.sessionId, null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.sessionId, attachable])

  // Programmatic focus (after create / sidebar click): make the real terminal take keyboard focus.
  useEffect(() => {
    if (!focused || !ptyId) return
    const active = document.activeElement
    const host = document.querySelector(
      `[data-testid=pane][data-session-id="${CSS.escape(session.sessionId)}"]`
    )
    if (host && active && host.contains(active)) return
    controller.current?.focus()
  }, [focused, ptyId, session.sessionId])

  const onDoubleClick = (): void => {
    toggleExpand(session.sessionId)
    controller.current?.clearSelection()
    window.getSelection()?.removeAllRanges()
  }
  const onHide = (): void => {
    hide(session.sessionId)
    void hydra.setHidden(session.sessionId, true)
  }
  // A finished session is removed from the daemon (stop+rm are tolerant) so it stops showing up.
  const onCloseEnded = async (): Promise<void> => {
    try {
      await hydra.stopSession(session.sessionId)
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const onStop = async (): Promise<void> => {
    const msg =
      session.state === 'working'
        ? `"${session.name}" está trabajando. ¿Terminarla igual?`
        : `¿Terminar la sesión "${session.name}"?`
    if (!ended && !window.confirm(msg)) return
    try {
      await hydra.stopSession(session.sessionId)
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const onRelaunch = async (): Promise<void> => {
    if (!session.projectId) return
    const suggestedName = await hydra.suggestSessionName(session.projectId)
    openDialog({ projectId: session.projectId, suggestedName })
  }
  const onExit = useCallback((code: number) => setExitCode(code), [])
  const startRename = (e: React.MouseEvent): void => {
    e.stopPropagation()
    setDraft(session.name)
    setEditing(true)
  }
  const commitRename = async (): Promise<void> => {
    setEditing(false)
    const name = draft.trim()
    if (!name || name === session.name) return
    try {
      await hydra.renameSession(session.sessionId, name)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <section
      className={`${styles.pane} ${focused ? styles.focused : ''}`}
      data-testid="pane"
      data-session-id={session.sessionId}
      data-focused={focused}
      data-expanded={expanded}
      onMouseDown={() => controller.current?.focus()}
      onDoubleClick={onDoubleClick}
    >
      <header className={styles.header} data-testid="pane-header">
        <StatusLight state={ended ? 'ended' : session.state} waitingFor={session.waitingFor} />
        {editing ? (
          <input
            className={styles.titleInput}
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void commitRename()}
            onMouseDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') void commitRename()
              if (e.key === 'Escape') setEditing(false)
            }}
            data-testid="pane-rename-input"
          />
        ) : (
          <span className={styles.title} title={session.cwd} data-testid="pane-title">
            {session.name}
          </span>
        )}
        {!editing && (
          <button
            className={styles.iconBtn}
            onClick={startRename}
            title="Renombrar sesión"
            data-testid="pane-rename"
          >
            ✎
          </button>
        )}
        <button
          className={styles.iconBtn}
          onClick={(e) => {
            e.stopPropagation()
            toggleExpand(session.sessionId)
          }}
          title={expanded ? 'Contraer' : 'Expandir'}
          data-testid="pane-expand"
        >
          {expanded ? '⤡' : '⤢'}
        </button>
        <button
          className={styles.iconBtn}
          onClick={onHide}
          title="Ocultar pane (la sesión sigue corriendo)"
          data-testid="pane-hide"
        >
          ⊟
        </button>
        <button
          className={styles.iconBtn}
          onClick={() => void onStop()}
          disabled={!attachable}
          title={attachable ? 'Terminar sesión' : 'Solo se pueden terminar sesiones en background'}
          data-testid="pane-stop"
        >
          ✕
        </button>
      </header>
      <div className={styles.body}>
        {ptyId && (
          <XTermView
            sessionId={session.sessionId}
            ptyId={ptyId}
            onExit={onExit}
            controllerRef={controller}
          />
        )}
        {ended && (
          <div className={styles.overlay} data-testid="pane-ended">
            <h3>Sesión finalizada{exitCode !== null ? ` (código ${exitCode})` : ''}</h3>
            <p className={styles.meta}>
              La última salida queda visible detrás. Podés cerrar este pane o relanzar una sesión
              nueva en el mismo proyecto.
            </p>
            <div className={styles.overlayActions}>
              <button onClick={() => void onCloseEnded()} data-testid="pane-close-ended">
                Cerrar
              </button>
              <button
                onClick={() => void onRelaunch()}
                disabled={!session.projectId}
                data-testid="pane-relaunch"
              >
                Relanzar
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
