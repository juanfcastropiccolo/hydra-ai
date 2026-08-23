import type { ClaudeAvailability } from '@shared/types'
import styles from './ClaudeUnavailable.module.css'

export function ClaudeUnavailable({
  availability
}: {
  availability: ClaudeAvailability
}): React.JSX.Element | null {
  if (availability.ok) return null
  return (
    <div className={styles.box} role="alert" data-testid="claude-unavailable">
      <h2>No encuentro Claude Code</h2>
      <p>{availability.message}</p>
      <p>Cómo resolverlo:</p>
      <div className={styles.hint}>{availability.hint}</div>
      <p style={{ color: 'var(--fg-muted)' }}>
        Cuando esté instalado, volvé a abrir Hydra. Hasta entonces no se pueden crear sesiones.
      </p>
    </div>
  )
}
