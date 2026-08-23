import styles from './Sidebar.module.css'
import { useAppStore } from '../store/app-store'

export function ProjectList(): React.JSX.Element {
  const projects = useAppStore((s) => s.projects)
  return (
    <div className={styles.projects} data-testid="project-list">
      <div className={styles.projectsHeader}>
        <span>Proyectos</span>
        <button className={styles.addBtn} disabled title="Se habilita en la próxima tarea">
          + Agregar
        </button>
      </div>
      {projects.length === 0 ? <p style={{ color: 'var(--fg-muted)' }}>Ningún proyecto.</p> : null}
      {projects.map((p) => (
        <div key={p.id}>{p.name}</div>
      ))}
    </div>
  )
}
