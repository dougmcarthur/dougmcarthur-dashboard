import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  label?: string
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-lg bg-danger-bg border border-danger-line px-5 py-4 space-y-1">
          <p className="text-sm font-medium text-danger-fg">
            {this.props.label ?? 'Something went wrong'}
          </p>
          <p className="text-xs text-danger-fg">{this.state.error.message}</p>
          <button
            onClick={() => this.setState({ error: null })}
            className="text-xs text-danger-fg underline hover:text-danger-fg"
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
