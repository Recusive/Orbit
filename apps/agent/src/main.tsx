import { getSentryConfig, REPLAY_OPTIONS } from '@orbit/common/lib';
import * as Sentry from '@sentry/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@xyflow/react/dist/style.css';
import './globals.css';
import App from './App';

// Enable React Scan in development to visualize component re-renders.
// Must run before createRoot so it can instrument React internals.
if (typeof __DEV__ !== 'undefined' && __DEV__) {
  void import('react-scan').then(({ scan }) => {
    scan({ enabled: true, log: false });
  });
}

// Initialize Sentry before rendering using shared config for consistency
// This ensures release naming, privacy settings, and sampling rates match
// Canvas and Editor apps which also use getSentryConfig
Sentry.init({
  ...getSentryConfig({ appTag: 'agent', enableReplay: true }),

  // Agent-specific integrations
  integrations: [
    // Performance monitoring - page loads, navigation, API calls
    Sentry.browserTracingIntegration(),
    // Session Replay with shared privacy settings
    Sentry.replayIntegration(REPLAY_OPTIONS),
    // Capture console warnings/errors as breadcrumbs
    Sentry.consoleLoggingIntegration({
      levels: ['warn', 'error'],
    }),
  ],
});

// Send verification log on app startup (only in development for debugging)
if (typeof __DEV__ !== 'undefined' && __DEV__) {
  Sentry.logger.info('Orbit app initialized', {
    version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0',
    log_source: 'app_startup',
  });

  // Expose Sentry globally for console testing in development
  // Usage: Sentry.captureMessage('test') or Sentry.captureException(new Error('test'))
  (window as unknown as { Sentry: typeof Sentry }).Sentry = Sentry;
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Failed to find the root element');
}

/**
 * Root-level error fallback for catastrophic failures.
 * Individual mode errors are handled by ErrorBoundary in App.tsx.
 */
const RootErrorFallback: Sentry.FallbackRender = (props) => {
  const handleReset = (): void => {
    props.resetError();
  };

  const handleReload = (): void => {
    window.location.reload();
  };

  const errorMessage =
    props.error instanceof Error ? props.error.message : 'An unexpected error occurred';

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-neutral-900 text-white">
      <div className="text-center space-y-4 max-w-md p-6">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="text-neutral-400 text-sm">{errorMessage}</p>
        <div className="flex gap-2 justify-center">
          <button
            type="button"
            onClick={handleReset}
            className="px-4 py-2 bg-neutral-700 hover:bg-neutral-600 rounded text-sm"
          >
            Try Again
          </button>
          <button
            type="button"
            onClick={handleReload}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm"
          >
            Reload App
          </button>
        </div>
      </div>
    </div>
  );
};

createRoot(rootElement).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={RootErrorFallback}>
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>
);
