import { Component } from 'react';
import PropTypes from 'prop-types';
import { AlertTriangle, RefreshCw } from 'lucide-react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-8">
          <div className="card text-center max-w-md p-8">
            <div className="w-14 h-14 rounded-full bg-danger/10 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-7 h-7 text-danger" />
            </div>
            <h1 className="font-heading text-xl font-bold text-text mb-2">Something went wrong</h1>
            <p className="text-text-secondary text-sm mb-2">An unexpected error occurred.</p>
            {this.state.error?.message && (
              <p className="text-xs font-mono text-text-muted bg-background rounded-lg px-3 py-2 mb-6 break-all">
                {this.state.error.message}
              </p>
            )}
            <button
              className="btn-primary mx-auto"
              onClick={() => window.location.reload()}
            >
              <RefreshCw className="w-4 h-4" />
              Reload page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired,
};

export default ErrorBoundary;
