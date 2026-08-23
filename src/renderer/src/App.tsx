import type { Session } from '@shared/types'

function App(): React.JSX.Element {
  // Compile-time proof the renderer sees the shared contract (task 5). Real UI starts at task 16.
  const sample: Session[] = []
  return (
    <main className="app">
      <h1>Hydra AI</h1>
      <p>Workspace de sesiones de Claude Code — esqueleto. Sesiones: {sample.length}</p>
    </main>
  )
}

export default App
