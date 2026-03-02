import { getSentryConfig, REPLAY_OPTIONS } from '@orbit/common/lib';
import * as Sentry from '@sentry/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@fontsource-variable/geist-mono';
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
//
// PERF: In development, skip replay and browser tracing integrations.
// Replay captures DOM mutations (heavy with frequent streaming updates) and
// browser tracing instruments all network calls — both add measurable overhead
// that distorts performance profiling.
const isDevelopment = typeof __DEV__ !== 'undefined' && __DEV__;

Sentry.init({
  ...getSentryConfig({ appTag: 'agent', enableReplay: !isDevelopment }),

  // Agent-specific integrations — lighter in development
  integrations: isDevelopment
    ? [
        // Only console logging in dev (minimal overhead)
        Sentry.consoleLoggingIntegration({
          levels: ['warn', 'error'],
        }),
      ]
    : [
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

// Suppress native WebKit context menu (Reload, Inspect, Autofill).
// Production desktop apps should not expose browser-level controls.
// Individual components that need custom context menus can stopPropagation.
document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
});

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
    <div className="h-screen w-screen flex items-center justify-center bg-background">
      <div className="relative flex flex-col items-center w-full max-w-[360px]" style={{ gap: 16 }}>
        {/* Icon */}
        <div className="flex w-full items-center" style={{ padding: '0 6px' }}>
          <div className="liquid-glass-icon flex shrink-0 items-center justify-center bg-destructive/10">
            <svg
              className="h-7 w-7 text-destructive"
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
          </div>
        </div>

        {/* Title + Description */}
        <div className="flex w-full flex-col items-start" style={{ padding: '0 6px 2px', gap: 10 }}>
          <h1 className="liquid-glass-title w-full">Something went wrong</h1>
          <p className="liquid-glass-desc w-full">{errorMessage}</p>
        </div>

        {/* Buttons */}
        <div className="flex w-full items-center" style={{ gap: 8 }}>
          <button
            type="button"
            className="liquid-glass-btn liquid-glass-btn-secondary flex-1 cursor-pointer transition-transform duration-75 active:scale-[0.97]"
            onClick={handleReset}
          >
            Try Again
          </button>
          <button
            type="button"
            className="liquid-glass-btn liquid-glass-btn-primary flex-1 cursor-pointer transition-transform duration-75 active:scale-[0.97]"
            onClick={handleReload}
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
