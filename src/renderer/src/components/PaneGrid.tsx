import { useMemo } from 'react'
import type { Project, Session } from '@shared/types'
import { useAppStore } from '../store/app-store'
import { ErrorBoundary } from './ErrorBoundary'
import { Pane } from './Pane'
import styles from './PaneGrid.module.css'

/**
 * Grid of panes grouped by project. The DOM shape is IDENTICAL in normal and expanded mode
 * (only class names change) so React never remounts a Pane when expanding/collapsing —
 * remounting would re-attach the PTY and drop focus.
 */
export function PaneGrid(): React.JSX.Element {
  const projects = useAppStore((s) => s.projects)
  const sessions = useAppStore((s) => s.sessions)
  const hidden = useAppStore((s) => s.hiddenSessionIds)
  const expandedId = useAppStore((s) => s.expandedSessionId)
  const visible = useMemo(
    () => sessions.filter((x) => x.bgId && !hidden.includes(x.sessionId)),
    [sessions, hidden]
  )
  const groups = useMemo(() => groupByProject(visible, projects), [visible, projects])
  const expanded = expandedId !== null && visible.some((s) => s.sessionId === expandedId)

  if (visible.length === 0) {
    return (
      <div
        data-testid="grid-empty"
        style={{ color: 'var(--fg-muted)', textAlign: 'center', marginTop: 80 }}
      >
        <h2>Sin sesiones visibles</h2>
        <p>
          Creá una con el botón ＋ de un proyecto, o mostrá una sesión oculta desde el panel
          izquierdo.
        </p>
      </div>
    )
  }

  return (
    <div
      className={expanded ? styles.expandedWrap : styles.wrap}
      data-testid="pane-grid"
      data-expanded={expanded ? 'true' : 'false'}
    >
      {groups.map(({ project, sessions }) => (
        <div
          key={project?.id ?? 'none'}
          className={expanded ? styles.groupExpanded : styles.group}
          data-testid="pane-group"
        >
          <span className={expanded ? styles.hiddenLabel : styles.groupLabel}>
            {project?.name ?? 'Sin proyecto'}
          </span>
          <div className={expanded ? styles.gridExpanded : styles.grid}>
            {sessions.map((s) => (
              <div
                key={s.sessionId}
                className={
                  !expanded
                    ? styles.cell
                    : s.sessionId === expandedId
                      ? styles.expandedPane
                      : styles.hiddenPane
                }
              >
                <ErrorBoundary label={`pane ${s.name}`}>
                  <Pane session={s} />
                </ErrorBoundary>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function groupByProject(
  sessions: Session[],
  projects: Project[]
): Array<{ project: Project | null; sessions: Session[] }> {
  const byId = new Map<string | null, Session[]>()
  for (const s of sessions) byId.set(s.projectId, [...(byId.get(s.projectId) ?? []), s])
  const out: Array<{ project: Project | null; sessions: Session[] }> = []
  for (const p of projects) {
    const list = byId.get(p.id)
    if (list) out.push({ project: p, sessions: list })
  }
  const orphan = byId.get(null)
  if (orphan) out.push({ project: null, sessions: orphan })
  return out
}
