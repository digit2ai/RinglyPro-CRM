import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('PINAXIS Error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, color: '#f87171', fontFamily: 'monospace', background: '#0f172a', minHeight: '100vh' }}>
          <h1 style={{ fontSize: 24, marginBottom: 16 }}>PINAXIS Dashboard Error</h1>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#fbbf24', fontSize: 14 }}>
            {this.state.error?.message || 'Unknown error'}
          </pre>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#94a3b8', fontSize: 12, marginTop: 16 }}>
            {this.state.error?.stack}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: 24, padding: '8px 24px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}
          >
            Reload Page
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
