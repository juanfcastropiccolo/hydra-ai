import { useEffect, useState } from 'react'
import type { ClaudeAvailability, Project, Session } from '@shared/types'

// Temporary wiring probe (task 14). Real UI replaces this from task 15/16 on.
function App(): React.JSX.Element {
  const [availability, setAvailability] = useState<ClaudeAvailability | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [sessions, setSessions] = useState<Session[]>([])

  useEffect(() => {
    void window.hydra.invoke('claude.availability').then(setAvailability)
    void window.hydra.invoke('projects.list').then(setProjects)
    void window.hydra.invoke('sessions.list').then(setSessions)
    const offA = window.hydra.on('claude.availability', setAvailability)
    const offP = window.hydra.on('projects.changed', (e) => setProjects(e.projects))
    const offS = window.hydra.on('sessions.changed', (e) => setSessions(e.sessions))
    return () => {
      offA()
      offP()
      offS()
    }
  }, [])

  return (
    <main className="app">
      <h1>Hydra AI</h1>
      <p data-testid="availability">
        Claude Code:{' '}
        {availability === null
          ? '…'
          : availability.ok
            ? `OK (${availability.version ?? availability.binaryPath})`
            : `NO — ${availability.message}`}
      </p>
      <p data-testid="counts">
        Proyectos: {projects.length} · Sesiones: {sessions.length}
      </p>
    </main>
  )
}

export default App
