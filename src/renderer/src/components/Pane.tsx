import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@shared/types'
import { droppedPathText } from '@shared/paths'
import { bracketedPaste } from '@shared/paste'
import { canImportInto } from '../lib/can-import'
import { hydra } from '../lib/hydra-client'
import { cancelImport, runImport } from '../lib/import-flow'
import { useAppStore } from '../store/app-store'
import { importContextStore, useImportContext } from '../store/import-context-slice'
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
  const [dropping, setDropping] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showToast = (msg: string): void => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2500)
  }
  const [draft, setDraft] = useState(session.name)
  const ended = session.state === 'ended' || exitCode !== null
  const attachable = Boolean(session.bgId)

  // Feature 004: import another session's context into this pane (FR-1, FR-10..14).
  const importState = useImportContext((s) => s.byTarget[session.sessionId])
  const importRunning = importState?.phase === 'running'
  const canImport = canImportInto({ session, ptyId, ended, importRunning })
  const sourceForRetry = useAppStore((s) =>
    importState ? s.sessions.find((x) => x.sessionId === importState.sourceSessionId) : undefined
  )
  const onImportClick = (e: React.MouseEvent): void => {
    e.stopPropagation()
    if (canImport.ok) importContextStore.getState().openDialog(session.sessionId)
  }
  // The paste: only when the text is ready AND the session is still idle (Constitution 3 / FR-12).
  // Re-evaluated on every state change, so a 'ready' import pastes as soon as the pane is idle again
  // after a 'Reintentar pegado', or when a hidden pane is shown again.
  useEffect(() => {
    if (importState?.phase !== 'ready' || !importState.text) return
    const ok = canImportInto({ session, ptyId, ended, importRunning: false })
    if (!ok.ok || !ptyId) {
      importContextStore.getState().markBlocked(session.sessionId)
      return
    }
    hydra.write(ptyId, bracketedPaste(importState.text))
    controller.current?.focus()
    importContextStore.getState().markDone(session.sessionId) // 'done' renders the green toast
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importState?.phase, importState?.text, session.state, ptyId, ended])
  // 'done' is transient (it is the green toast): forget it after a moment.
  useEffect(() => {
    if (importState?.phase !== 'done') return
    const t = setTimeout(() => importContextStore.getState().clear(session.sessionId), 2500)
    return () => clearTimeout(t)
  }, [importState?.phase, session.sessionId])
  const copyImport = async (): Promise<void> => {
    if (!importState?.text) return
    try {
      await navigator.clipboard.writeText(importState.text)
      showToast('Contexto copiado al portapapeles')
    } catch (e) {
      setError((e as Error).message)
    }
  }

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

  // Feature 002: drop a file from the tree → type its path into this session (FR-15).
  const HYDRA_PATH_MIME = 'application/x-hydra-path'
  const acceptsDrag = (e: React.DragEvent): boolean =>
    Boolean(ptyId) &&
    !ended &&
    (e.dataTransfer.types.includes(HYDRA_PATH_MIME) || e.dataTransfer.types.includes('Files'))
  const onDragOver = (e: React.DragEvent): void => {
    if (!acceptsDrag(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    if (!dropping) setDropping(true)
  }
  const onDragLeave = (): void => setDropping(false)
  const onDrop = (e: React.DragEvent): void => {
    setDropping(false)
    if (!ptyId || ended) return
    // Paths: from Hydra's own tree, or from Finder (one or many files)
    const paths: string[] = []
    const own = e.dataTransfer.getData(HYDRA_PATH_MIME)
    if (own) paths.push(own)
    else if (e.dataTransfer.files?.length) {
      for (const f of Array.from(e.dataTransfer.files)) {
        try {
          const p = window.hydraFiles.pathFor(f)
          if (p) paths.push(p)
        } catch {
          /* not a file */
        }
      }
    }
    if (paths.length === 0) return
    e.preventDefault()
    e.stopPropagation()
    hydra.write(ptyId, paths.map((p) => droppedPathText(p, session.cwd)).join(''))
    controller.current?.focus()
    const names = paths.map((p) => p.split('/').pop() ?? p)
    showToast(names.length === 1 ? `Adjuntado: ${names[0]}` : `Adjuntados ${names.length} archivos`)
  }

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
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      data-dropping={dropping}
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
          onClick={onImportClick}
          disabled={!canImport.ok}
          title={
            canImport.ok
              ? 'Importar contexto de otra sesión'
              : `Importar contexto: ${canImport.reason}`
          }
          data-testid="pane-import"
        >
          ⇩
        </button>
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
        {toast && (
          <div className={styles.toast} role="status" data-testid="pane-toast">
            <span className={styles.toastCheck}>✓</span> {toast}
          </div>
        )}
        {importState?.phase === 'done' && (
          <div className={styles.toast} role="status" data-testid="pane-toast">
            <span className={styles.toastCheck}>✓</span> Contexto de {importState.sourceName} listo
            para enviar — revisalo y pulsá Enter
          </div>
        )}
        {importState?.phase === 'running' && (
          <div
            className={`${styles.banner} ${styles.bannerInfo}`}
            role="status"
            data-testid="import-progress"
            onMouseDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <span className={styles.spinner} aria-hidden="true" />
            <span className={styles.bannerText}>
              Resumiendo el contexto de <b>{importState.sourceName}</b>…
            </span>
            <button
              onClick={() => void cancelImport(session.sessionId)}
              data-testid="import-cancel-progress"
            >
              Cancelar
            </button>
          </div>
        )}
        {importState?.phase === 'blocked' && (
          <div
            className={`${styles.banner} ${styles.bannerWarn}`}
            role="status"
            data-testid="import-blocked"
            onMouseDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <span className={styles.bannerText}>
              El contexto de <b>{importState.sourceName}</b> está listo, pero la sesión ya no está
              en reposo ({canImport.ok ? 'ahora sí' : canImport.reason.toLowerCase()}). No se pegó
              para no interrumpirla.
            </span>
            <button onClick={() => void copyImport()} data-testid="import-copy">
              Copiar
            </button>
            <button
              onClick={() => importContextStore.getState().retryPaste(session.sessionId)}
              data-testid="import-retry-paste"
            >
              Reintentar pegado
            </button>
            <button
              className={styles.iconBtn}
              onClick={() => importContextStore.getState().clear(session.sessionId)}
              title="Descartar"
              data-testid="import-dismiss"
            >
              ✕
            </button>
          </div>
        )}
        {importState?.phase === 'error' && (
          <div
            className={`${styles.banner} ${styles.bannerError}`}
            role="alert"
            data-testid="import-error"
            onMouseDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <span className={styles.bannerText}>
              No se pudo importar el contexto de <b>{importState.sourceName}</b>:{' '}
              {importState.error}
            </span>
            <button
              onClick={() => sourceForRetry && void runImport(session.sessionId, sourceForRetry)}
              disabled={!sourceForRetry}
              title={
                sourceForRetry ? 'Volver a generar el resumen' : 'La sesión origen ya no existe'
              }
              data-testid="import-retry"
            >
              Reintentar
            </button>
            <button
              className={styles.iconBtn}
              onClick={() => importContextStore.getState().clear(session.sessionId)}
              title="Cerrar"
              data-testid="import-dismiss"
            >
              ✕
            </button>
          </div>
        )}
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
