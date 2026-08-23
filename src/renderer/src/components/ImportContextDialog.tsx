// Feature 004 FR-2/3/4: pick the source session whose context gets imported into the target pane.
import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@shared/types'
import { hydra } from '../lib/hydra-client'
import { groupImportCandidates } from '../lib/import-candidates'
import { useAppStore } from '../store/app-store'
import { useImportContext } from '../store/import-context-slice'
import styles from './ImportContextDialog.module.css'
import { StatusLight } from './StatusLight'

export function ImportContextDialog({
  onPick
}: {
  /** Called with the chosen source; the caller starts the import. */
  onPick: (target: string, source: Session) => void
}): React.JSX.Element | null {
  const target = useImportContext((s) => s.dialogTargetId)
  if (!target) return null
  return <Dialog key={target} target={target} onPick={onPick} />
}

function Dialog({
  target,
  onPick
}: {
  target: string
  onPick: (target: string, source: Session) => void
}): React.JSX.Element {
  const close = useImportContext((s) => s.closeDialog)
  const sessions = useAppStore((s) => s.sessions)
  const projects = useAppStore((s) => s.projects)
  const targetSession = sessions.find((s) => s.sessionId === target)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [model, setModel] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    hydra
      .getImportContext()
      .then((p) => alive && setModel(p.model))
      .catch(() => alive && setModel('?'))
    return () => {
      alive = false
    }
  }, [])

  const groups = useMemo(
    () => groupImportCandidates({ sessions, projects, targetSessionId: target, query }),
    [sessions, projects, target, query]
  )
  const flat = useMemo(() => groups.flatMap((g) => g.sessions), [groups])
  const current = flat.find((s) => s.sessionId === selected) ?? flat[0]

  const confirm = (s: Session | undefined): void => {
    if (!s) return
    onPick(target, s)
  }
  const move = (delta: number): void => {
    if (!flat.length) return
    const idx = Math.max(
      0,
      flat.findIndex((s) => s.sessionId === current?.sessionId)
    )
    const next = flat[(idx + delta + flat.length) % flat.length]
    if (next) setSelected(next.sessionId)
  }
  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      move(1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      move(-1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      confirm(current)
    }
  }

  return (
    <div
      className={styles.backdrop}
      onMouseDown={(e) => e.target === e.currentTarget && close()}
      data-testid="import-context-dialog"
    >
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="icd-title"
        onKeyDown={onKeyDown}
      >
        <h2 id="icd-title">
          Importar contexto a <em>{targetSession?.name ?? target}</em>
        </h2>
        <p className={styles.hint}>
          Elegí la sesión cuyo contexto querés traer. Se genera un resumen y queda pegado en el
          prompt de este pane para que lo revises antes de enviarlo.
        </p>
        <input
          className={styles.filter}
          placeholder="Filtrar por sesión o proyecto…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setSelected(null)
          }}
          autoFocus
          data-testid="import-filter"
        />
        <div className={styles.list} role="listbox" aria-label="Sesiones activas">
          {groups.length === 0 && (
            <div className={styles.empty} data-testid="import-empty">
              {query ? 'Ninguna sesión coincide con el filtro.' : 'No hay otras sesiones activas.'}
            </div>
          )}
          {groups.map((g) => (
            <div key={g.projectId ?? '__none'} className={styles.group}>
              <div className={styles.groupTitle}>{g.projectName}</div>
              {g.sessions.map((s) => {
                const external = !s.bgId
                const isSel = s.sessionId === current?.sessionId
                return (
                  <div
                    key={s.sessionId}
                    role="option"
                    aria-selected={isSel}
                    className={`${styles.item} ${isSel ? styles.selected : ''}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setSelected(s.sessionId)}
                    onDoubleClick={() => confirm(s)}
                    data-testid="import-candidate"
                    data-session-id={s.sessionId}
                  >
                    <StatusLight state={s.state} waitingFor={s.waitingFor} />
                    <span className={styles.name}>{s.name}</span>
                    {external && <span className={styles.external}>externa</span>}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
        <div className={styles.footer}>
          <span className={styles.model} data-testid="import-model">
            Se resumirá con: <code>{model ?? '…'}</code>
          </span>
          <div className={styles.actions}>
            <button type="button" onClick={close} data-testid="import-cancel">
              Cancelar
            </button>
            <button
              type="button"
              className={styles.primary}
              disabled={!current}
              onClick={() => confirm(current)}
              data-testid="import-confirm"
            >
              Importar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
