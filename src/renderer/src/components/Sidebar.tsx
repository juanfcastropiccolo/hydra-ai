import styles from './Sidebar.module.css'
import { ProjectList } from './ProjectList'

const NAV = [
  { key: 'sessions', label: 'Sessions', enabled: true },
  { key: 'analytics', label: 'Analytics', enabled: false },
  { key: 'graph', label: 'Graph Know', enabled: false },
  { key: 'config', label: 'Config', enabled: false }
] as const

export function Sidebar(): React.JSX.Element {
  const user = { initials: 'JF', name: 'Juan' }
  return (
    <aside className={styles.sidebar} data-testid="sidebar">
      <div className={styles.brand}>HYDRA AI</div>
      <nav className={styles.nav} aria-label="Secciones">
        {NAV.map((n) => (
          <button
            key={n.key}
            className={`${styles.navBtn} ${n.key === 'sessions' ? styles.navBtnActive : ''}`}
            disabled={!n.enabled}
            title={n.enabled ? n.label : `${n.label} — próximamente`}
          >
            {n.label}
          </button>
        ))}
      </nav>
      <div className={styles.divider} />
      <ProjectList />
      <div className={styles.user} data-testid="user-block">
        <span className={styles.avatar}>{user.initials}</span>
        <span>{user.name}</span>
      </div>
    </aside>
  )
}
