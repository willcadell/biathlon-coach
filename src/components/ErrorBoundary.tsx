import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Catches a render crash anywhere below it and shows a recoverable message
 * instead of leaving the whole app blank — React unmounts past whichever
 * boundary is nearest the failure, and without one anywhere in the tree that
 * meant the entire app, tab bar included. Reload is the recovery action
 * rather than anything cleverer, since the crash can be deep inside a child
 * component's own navigation state (e.g. History's open-bout view) that this
 * boundary has no way to reset directly.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Render crashed:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="empty">
          <p>Something went wrong showing this.</p>
          <p className="meta">{this.state.error.message}</p>
          <button className="secondary" style={{ marginTop: 12 }} onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
