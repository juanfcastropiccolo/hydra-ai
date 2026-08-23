import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  label?: string
}
interface State {
  error: Error | null
}

/** Keeps one broken pane/component from blanking the whole window (Constitution principle 6). */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }
  static getDerivedStateFromError(error: Error): State {
    return { error }
  }
  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[hydra] component crashed:', this.props.label, error, info.componentStack)
  }
  render(): ReactNode {
    if (this.state.error) {
      return (
        <div
          role="alert"
          style={{ padding: 16, color: 'var(--danger)' }}
          data-testid="error-boundary"
        >
          <strong>Algo se rompió en {this.props.label ?? 'este componente'}.</strong>
          <div style={{ color: 'var(--fg-muted)', fontSize: 12, marginTop: 6 }}>
            {this.state.error.message}
          </div>
          <button style={{ marginTop: 10 }} onClick={() => this.setState({ error: null })}>
            Reintentar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
