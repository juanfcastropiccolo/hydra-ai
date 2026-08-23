import type { SessionState } from '@shared/types'
import styles from './StatusLight.module.css'

const LABEL: Record<SessionState, string> = {
  working: 'Trabajando',
  waiting: 'Esperando tu acción',
  idle: 'Ocioso',
  ended: 'Finalizada'
}

export function StatusLight({
  state,
  waitingFor
}: {
  state: SessionState
  waitingFor?: string
}): React.JSX.Element {
  const title =
    state === 'waiting' && waitingFor ? `${LABEL.waiting} (${waitingFor})` : LABEL[state]
  return (
    <span
      className={`${styles.dot} ${styles[state]}`}
      title={title}
      aria-label={title}
      data-state={state}
      data-testid="status-light"
    />
  )
}
