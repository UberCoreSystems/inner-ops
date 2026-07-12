import React from 'react';
import logger from '../utils/logger';
import { AppIcon } from './AppIcons';

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

  static getDerivedStateFromError(_error) {
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
      const { fallback, showDetails = import.meta.env.DEV } = this.props;

      // If custom fallback provided, use it
      if (fallback) {
        return fallback;
      }

      // Default error UI
      return (
        <div className="min-h-screen bg-black flex items-center justify-center p-4">
          <div className="max-w-2xl w-full">
            <div className="oura-card p-8">
              {/* Error Icon */}
              <div className="flex items-center justify-center mb-6">
                <div className="w-16 h-16 rounded-2xl bg-[#ef4444]/10 border border-[#ef4444]/25 flex items-center justify-center">
                  <AppIcon name="emergency" size={28} color="#ef4444" glow={false} />
                </div>
              </div>

              {/* Error Title */}
              <h1 className="text-2xl font-light text-white text-center mb-3 tracking-tight">
                The system hit an error.
              </h1>

              <p className="text-[#858585] text-center text-sm mb-8">
                Your data is intact. Reload, or return to where you were.
              </p>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 justify-center mb-8">
                <button
                  onClick={this.handleReset}
                  className="px-6 py-2.5 bg-white text-black rounded-xl font-medium text-sm hover:bg-[#d1d1d1] transition-colors"
                >
                  Try Again
                </button>
                <button
                  onClick={this.handleReload}
                  className="px-6 py-2.5 bg-[#1a1a1a] border border-[#2a2a2a] text-[#ababab] rounded-xl font-medium text-sm hover:text-white hover:border-[#3a3a3a] transition-colors"
                >
                  Reload
                </button>
              </div>

              {/* Error Details (collapsible) — dev only by default */}
              {showDetails && error && (
                <details className="mt-6">
                  <summary className="cursor-pointer text-xs text-[#5a5a5a] hover:text-[#858585] mb-2">
                    Technical details
                  </summary>
                  <div className="bg-[#050505] rounded-xl p-4 border border-[#1a1a1a]">
                    <div className="mb-4">
                      <p className="text-xs text-[#5a5a5a] uppercase tracking-wide mb-1">Error Message</p>
                      <p className="text-[#ef4444] font-mono text-sm break-all">
                        {error.toString()}
                      </p>
                    </div>
                    {errorInfo && (
                      <div>
                        <p className="text-xs text-[#5a5a5a] uppercase tracking-wide mb-1">Component Stack</p>
                        <pre className="text-xs text-[#858585] overflow-auto max-h-48 font-mono">
                          {errorInfo.componentStack}
                        </pre>
                      </div>
                    )}
                  </div>
                </details>
              )}
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
        <div className="p-4 bg-[#ef4444]/10 border border-[#ef4444]/30 rounded-xl">
          <p className="text-[#ef4444] text-sm">
            {this.props.name || 'Component'} failed to load
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
