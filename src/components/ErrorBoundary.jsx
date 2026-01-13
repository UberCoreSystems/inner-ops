import React from 'react';
import logger from '../utils/logger';

/**
 * ErrorBoundary Component
 * Catches JavaScript errors anywhere in the child component tree,
 * logs those errors, and displays a fallback UI instead of crashing the whole app.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log error details
    logger.error('🚨 Error Boundary Caught:', {
      error: error.toString(),
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString()
    });

    // Update state with error details
    this.setState(prevState => ({
      error,
      errorInfo,
      errorCount: prevState.errorCount + 1
    }));

    // If too many errors (possible infinite loop), force refresh
    if (this.state.errorCount > 5) {
      logger.error('🔥 Too many errors detected, forcing reload...');
      setTimeout(() => window.location.reload(), 2000);
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const { error, errorInfo } = this.state;
      const { fallback, showDetails = true } = this.props;

      // If custom fallback provided, use it
      if (fallback) {
        return fallback;
      }

      // Default error UI
      return (
        <div className="min-h-screen bg-black flex items-center justify-center p-4">
          <div className="max-w-2xl w-full">
            <div className="bg-gradient-to-br from-red-900/20 to-orange-900/20 border border-red-500/30 rounded-2xl p-8">
              {/* Error Icon */}
              <div className="flex items-center justify-center mb-6">
                <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center">
                  <span className="text-5xl">⚠️</span>
                </div>
              </div>

              {/* Error Title */}
              <h1 className="text-3xl font-bold text-white text-center mb-4">
                Something Went Wrong
              </h1>

              <p className="text-gray-300 text-center mb-8">
                The app encountered an unexpected error. Don't worry, your data is safe.
              </p>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
                <button
                  onClick={this.handleReset}
                  className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-semibold hover:opacity-90 transition-opacity"
                >
                  Try Again
                </button>
                <button
                  onClick={this.handleReload}
                  className="px-6 py-3 bg-gray-700 text-white rounded-xl font-semibold hover:bg-gray-600 transition-colors"
                >
                  Reload App
                </button>
              </div>

              {/* Error Details (collapsible) */}
              {showDetails && error && (
                <details className="mt-6">
                  <summary className="cursor-pointer text-sm text-gray-400 hover:text-gray-300 mb-2">
                    🔍 Technical Details (for debugging)
                  </summary>
                  <div className="bg-black/40 rounded-lg p-4 border border-gray-700">
                    <div className="mb-4">
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Error Message</p>
                      <p className="text-red-400 font-mono text-sm break-all">
                        {error.toString()}
                      </p>
                    </div>
                    {errorInfo && (
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Component Stack</p>
                        <pre className="text-xs text-gray-400 overflow-auto max-h-48 font-mono">
                          {errorInfo.componentStack}
                        </pre>
                      </div>
                    )}
                  </div>
                </details>
              )}

              {/* Help Text */}
              <p className="text-xs text-gray-500 text-center mt-6">
                If this problem persists, try clearing your browser cache or contact support.
              </p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Lightweight error boundary for smaller components
 * Shows inline error message instead of full-screen
 */
export class InlineErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    logger.error('🔸 Inline Error:', {
      component: this.props.name || 'Unknown',
      error: error.toString(),
      errorInfo
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 bg-red-900/20 border border-red-500/30 rounded-lg">
          <p className="text-red-400 text-sm">
            ⚠️ {this.props.name || 'Component'} failed to load
          </p>
          {this.props.showError && (
            <p className="text-xs text-gray-400 mt-1 font-mono">
              {this.state.error?.message}
            </p>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
