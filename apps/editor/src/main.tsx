/**
 * Editor App Entry Point
 *
 * Initializes Sentry error monitoring and renders the Editor app
 * with a root-level error boundary for catastrophic failures.
 */
import { getSentryConfig, REPLAY_OPTIONS } from '@orbit/common/lib';
import * as Sentry from '@sentry/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import './globals.css';

// ============================================
// Initialize Sentry
// ============================================
Sentry.init({
  ...getSentryConfig({ appTag: 'editor', enableReplay: true }),

  // Editor-specific integrations
  integrations: [
    // Performance monitoring
    Sentry.browserTracingIntegration(),
    // Session Replay with privacy masking
    Sentry.replayIntegration(REPLAY_OPTIONS),
    // Console logging (only warn/error)
    Sentry.consoleLoggingIntegration({
      levels: ['warn', 'error'],
    }),
  ],
});

// Send verification log on app startup (only in development for debugging)
if (typeof __DEV__ !== 'undefined' && __DEV__) {
  Sentry.logger.info('Editor app initialized', {
    version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0',
    log_source: 'app_startup',
  });

  // Expose Sentry globally for console testing in development
  (window as unknown as { Sentry: typeof Sentry }).Sentry = Sentry;
}

// Declare globals that Vite defines
declare const __DEV__: boolean;
declare const __APP_VERSION__: string;

// ============================================
// Root Error Fallback
// ============================================

/**
 * Root-level error fallback for catastrophic failures.
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
        <h1 className="text-xl font-semibold">Editor Error</h1>
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

// ============================================
// Render App
// ============================================

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

createRoot(rootElement).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={RootErrorFallback}>
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>
);
