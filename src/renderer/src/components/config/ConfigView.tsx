// Feature 007: preferences view (placeholder until task 8 lands the Discord-like layout).
import styles from './config.module.css'

export function ConfigView(): React.JSX.Element {
  return (
    <div className={styles.view} data-testid="config-root">
      <h1 className={styles.h1}>Config</h1>
    </div>
  )
}
