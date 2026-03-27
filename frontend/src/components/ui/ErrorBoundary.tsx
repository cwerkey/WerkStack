import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children:  ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error:    Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: 40, gap: 8,
        }}>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
            color: 'var(--red, #c07070)', fontWeight: 700,
          }}>
            component error
          </div>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
            color: 'var(--text3, #4e5560)', maxWidth: 400, textAlign: 'center',
          }}>
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </div>
          <button
            className="btn-ghost"
            style={{ marginTop: 8 }}
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
