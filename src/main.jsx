import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { initAnalytics } from './utils/analytics';
import './index.css';

initAnalytics();

// Sentry is only active when VITE_SENTRY_DSN is set.
// Get your DSN from https://sentry.io → Project Settings → Client Keys.
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    // Capture 10% of sessions for performance tracing in production
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
    // Capture 100% of sessions when replays are enabled (adjust as needed)
    replaysOnErrorSampleRate: 1.0,
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
  });
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<ErrorBoundary />} showDialog>
      <App />
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);
