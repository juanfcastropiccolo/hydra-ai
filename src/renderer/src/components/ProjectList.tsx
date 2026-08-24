import { useState } from 'react'
import { PROJECT_COLORS, type Project, type ProjectColor, type Session } from '@shared/types'
import { hydra } from '../lib/hydra-client'
import { selectAttentionCount, useAppStore } from '../store/app-store'
import side from './Sidebar.module.css'
import styles from './ProjectList.module.css'
import { StatusLight } from './StatusLight'

export function ProjectList(): React.JSX.Element {
  const projects = useAppStore((s) => s.projects)
  const availability = useAppStore((s) => s.availability)
  const setError = useAppStore((s) => s.setError)
  const canUseClaude = availability?.ok === true

  const addProject = async (): Promise<void> => {
    try {
      const path = await hydra.pickFolder()
      if (path) await hydra.addProject(path)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className={side.projects} data-testid="project-list">
      <div className={side.projectsHeader}>
        <span>Proyectos</span>
        <button className={side.addBtn} onClick={addProject} data-testid="add-project">
          + Agregar
        </button>
      </div>
      {projects.length === 0 ? <p className={styles.muted}>Ningún proyecto.</p> : null}
      {projects.map((p) => (
        <ProjectRow key={p.id} project={p} canUseClaude={canUseClaude} />
      ))}
    </div>
  )
}

function ProjectRow({
  project,
  canUseClaude
}: {
  project: Project
  canUseClaude: boolean
}): React.JSX.Element {
  const allSessions = useAppStore((s) => s.sessions)
  const sessions = allSessions.filter((x) => x.projectId === project.id)
  const attention = useAppStore((s) => selectAttentionCount(s, project.id))
  const hidden = useAppStore((s) => s.hiddenSessionIds)
  const openDialog = useAppStore((s) => s.openNewSessionDialog)
  const show = useAppStore((s) => s.show)
  const focus = useAppStore((s) => s.focus)
  const setError = useAppStore((s) => s.setError)
  const [collapsed, setCollapsed] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(project.name)

  const newSession = async (): Promise<void> => {
    try {
      const suggestedName = await hydra.suggestSessionName(project.id)
      openDialog({ projectId: project.id, suggestedName })
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const commitRename = async (): Promise<void> => {
    setEditing(false)
    const name = draft.trim()
    if (!name || name === project.name) return setDraft(project.name)
    try {
      await hydra.renameProject(project.id, name)
    } catch (e) {
      setError((e as Error).message)
      setDraft(project.name)
    }
  }
  const remove = async (): Promise<void> => {
    if (
      !window.confirm(`¿Quitar "${project.name}" de Hydra? La carpeta y sus sesiones no se tocan.`)
    )
      return
    await hydra.removeProject(project.id)
  }
  const clickSession = (s: Session): void => {
    if (!s.bgId) return
    if (hidden.includes(s.sessionId)) {
      show(s.sessionId)
      void hydra.setHidden(s.sessionId, false)
    }
    focus(s.sessionId)
  }

  return (
    <div className={styles.project} data-testid="project" data-project-id={project.id}>
      <div
        className={`${styles.projectRow} ${project.missing ? styles.missing : ''} ${project.color ? styles.colored : ''}`}
        style={
          project.color
            ? ({ '--project-color': PROJECT_COLORS[project.color] } as React.CSSProperties)
            : undefined
        }
        title={project.path}
        data-color={project.color ?? ''}
      >
        <span
          className={styles.caret}
          onClick={() => setCollapsed((c) => !c)}
          role="button"
          aria-label={collapsed ? 'Expandir' : 'Colapsar'}
        >
          {collapsed ? '▸' : '▾'}
        </span>
        {editing ? (
          <>
            <input
              className={styles.nameInput}
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onBlur={(e) => {
                // keep editing while the user is picking a color
                if (e.relatedTarget instanceof HTMLElement && e.relatedTarget.dataset['swatch'])
                  return
                void commitRename()
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void commitRename()
                if (e.key === 'Escape') {
                  setDraft(project.name)
                  setEditing(false)
                }
              }}
              data-testid="project-name-input"
            />
            <span className={styles.swatches} role="group" aria-label="Color del proyecto">
              {(Object.keys(PROJECT_COLORS) as ProjectColor[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`${styles.swatch} ${project.color === c ? styles.swatchActive : ''}`}
                  style={{ background: PROJECT_COLORS[c] }}
                  title={c}
                  data-swatch={c}
                  data-testid={`project-color-${c}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() =>
                    void hydra.setProjectColor(project.id, project.color === c ? null : c)
                  }
                />
              ))}
            </span>
          </>
        ) : (
          <span
            className={styles.name}
            onDoubleClick={() => setEditing(true)}
            data-testid="project-name"
          >
            {project.name}
          </span>
        )}
        {attention > 0 && (
          <span
            className={styles.badge}
            title={`${attention} sesión(es) esperando tu acción`}
            data-testid="attention-badge"
          >
            {attention}
          </span>
        )}
        <button
          className={styles.iconBtn}
          onClick={() => void newSession()}
          disabled={!canUseClaude || project.missing}
          title={
            project.missing
              ? 'La carpeta no existe'
              : !canUseClaude
                ? 'Claude Code no disponible'
                : 'Nueva sesión'
          }
          data-testid="new-session"
        >
          ＋
        </button>
        <button
          className={styles.iconBtn}
          onClick={() => void remove()}
          title="Quitar proyecto"
          data-testid="remove-project"
        >
          ✕
        </button>
      </div>
      {project.missing && (
        <div className={styles.warnText}>⚠ La carpeta ya no existe: {project.path}</div>
      )}
      {!collapsed && (
        <div className={styles.sessions}>
          {sessions.length === 0 && (
            <span className={`${styles.muted}`} style={{ padding: '2px 8px' }}>
              Sin sesiones
            </span>
          )}
          {sessions.map((s) => {
            const isHidden = hidden.includes(s.sessionId)
            const external = !s.bgId
            return (
              <button
                key={s.sessionId}
                className={`${styles.session} ${isHidden ? styles.sessionHidden : ''}`}
                onClick={() => clickSession(s)}
                disabled={external}
                title={
                  external
                    ? 'Abierta en una terminal externa. Mandala a background (/bg) desde esa terminal para operarla en Hydra.'
                    : isHidden
                      ? 'Mostrar pane'
                      : 'Ir al pane'
                }
                data-testid="session-item"
                data-session-id={s.sessionId}
              >
                <StatusLight state={s.state} waitingFor={s.waitingFor} />
                <span className={styles.sessionName}>{s.name}</span>
                {external && <span className={styles.external}>externa</span>}
                {isHidden && !external && <span className={styles.external}>oculta</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
