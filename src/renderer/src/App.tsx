import { useEffect } from 'react'
import styles from './App.module.css'
import { ClaudeUnavailable } from './components/ClaudeUnavailable'
import { Sidebar } from './components/Sidebar'
import { initHydraClient } from './lib/hydra-client'
import { useAppStore } from './store/app-store'

function App(): React.JSX.Element {
  const availability = useAppStore((s) => s.availability)
  const projects = useAppStore((s) => s.projects)
  const lastError = useAppStore((s) => s.lastError)
  const setError = useAppStore((s) => s.setError)
  const escape = useAppStore((s) => s.escape)

  useEffect(() => initHydraClient(), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && escape()) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [escape])

  return (
    <div className={styles.shell}>
      <Sidebar />
      <section className={styles.main}>
        <header className={styles.topbar}>
          <span className={styles.topbarTitle}>Sesiones</span>
          <span className={styles.topbarSpacer} />
          <span className={styles.topbarTitle} data-testid="claude-status">
            {availability === null
              ? 'Claude Code: …'
              : availability.ok
                ? `Claude Code ${availability.version ?? ''}`
                : 'Claude Code: no disponible'}
          </span>
        </header>
        {lastError && (
          <div className={styles.errorBanner} role="alert">
            <span>⚠️ {lastError}</span>
            <button onClick={() => setError(null)}>Cerrar</button>
          </div>
        )}
        <div className={styles.content}>
          {availability && !availability.ok ? (
            <ClaudeUnavailable availability={availability} />
          ) : projects.length === 0 ? (
            <div className={styles.empty} data-testid="empty-state">
              <h2>Sin proyectos todavía</h2>
              <p>
                Agregá una carpeta desde el panel de la izquierda para empezar a crear sesiones.
              </p>
            </div>
          ) : (
            <div className={styles.empty} data-testid="grid-placeholder">
              <p>La grilla de terminales llega en la próxima tarea.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

export default App
