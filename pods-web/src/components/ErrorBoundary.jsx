import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: '100vh',
            padding: 24,
            fontFamily: 'system-ui, sans-serif',
            background: '#f8fafc',
            color: '#0f172a',
          }}
        >
          <h1 style={{ fontSize: 18, marginBottom: 8 }}>Bir hata oluştu</h1>
          <p style={{ color: '#64748b', marginBottom: 16 }}>
            Panel yüklenirken beklenmeyen bir sorun oluştu. Sayfayı yenileyin veya destek ile iletişime geçin.
          </p>
          <pre
            style={{
              fontSize: 12,
              overflow: 'auto',
              padding: 12,
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
            }}
          >
            {String(this.state.error?.message || this.state.error)}
          </pre>
          <button
            type="button"
            style={{
              marginTop: 16,
              padding: '10px 16px',
              borderRadius: 8,
              border: 'none',
              background: '#e95422',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            onClick={() => window.location.reload()}
          >
            Sayfayı yenile
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
