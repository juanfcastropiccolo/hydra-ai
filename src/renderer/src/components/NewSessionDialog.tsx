import { useState } from 'react'
import type { Project } from '@shared/types'
import { hydra } from '../lib/hydra-client'
import { useAppStore, type NewSessionDialogState } from '../store/app-store'
import styles from './NewSessionDialog.module.css'

export function NewSessionDialog(): React.JSX.Element | null {
  const dialog = useAppStore((s) => s.newSessionDialog)
  const projects = useAppStore((s) => s.projects)
  const project = projects.find((p) => p.id === dialog?.projectId)
  if (!dialog || !project) return null
  // Keyed so local state resets whenever a different dialog opens (no effects needed).
  return (
    <DialogForm
      key={`${dialog.projectId}:${dialog.suggestedName}`}
      dialog={dialog}
      project={project}
    />
  )
}

function DialogForm({
  dialog,
  project
}: {
  dialog: NewSessionDialogState
  project: Project
}): React.JSX.Element {
  const close = useAppStore((s) => s.closeNewSessionDialog)
  const focus = useAppStore((s) => s.focus)
  const [name, setName] = useState(dialog.suggestedName)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const valid = name.trim().length > 0 && !busy

  const create = async (): Promise<void> => {
    if (!valid) return
    setBusy(true)
    setError(null)
    try {
      const s = await hydra.createSession(project.id, name.trim(), dialog.cwd)
      close()
      focus(s.sessionId)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div
      className={styles.backdrop}
      onMouseDown={(e) => e.target === e.currentTarget && close()}
      data-testid="new-session-dialog"
    >
      <form
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="nsd-title"
        onSubmit={(e) => {
          e.preventDefault()
          void create()
        }}
      >
        <h2 id="nsd-title">Nueva sesión en {project.name}</h2>
        <label className={styles.field}>
          <span className={styles.label}>Nombre de la sesión</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            onFocus={(e) => e.target.select()}
            data-testid="session-name-input"
          />
        </label>
        <div className={styles.field}>
          <span className={styles.label}>Carpeta</span>
          <div className={styles.path} data-testid="session-cwd">
            {dialog.cwd ?? project.path}
          </div>
        </div>
        {error && <div className={styles.error}>{error}</div>}
        <div className={styles.actions}>
          <button type="button" onClick={close} disabled={busy} data-testid="cancel-session">
            Cancelar
          </button>
          <button
            type="submit"
            className={styles.primary}
            disabled={!valid}
            data-testid="create-session"
          >
            {busy ? 'Creando…' : 'Crear'}
          </button>
        </div>
      </form>
    </div>
  )
}
