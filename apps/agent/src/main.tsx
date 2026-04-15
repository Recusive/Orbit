import { getSentryConfig, REPLAY_OPTIONS } from '@orbit/common/lib';
import * as Sentry from '@sentry/react';
import { createRoot } from 'react-dom/client';

import '@fontsource-variable/geist-mono';
import './globals.css';
import App from './App';

import { startViewportWidthTracking } from '@/lib/chat/streamdown-render-utils';
import { loadConversationDetailFresh } from '@/lib/query/conversation-detail';
import { claudeConversationRepo } from '@/services/conversations/claude-conversation-repo';
import { warmMemoryCacheFromIdb } from '@/stores/chat/render-cache-store';

// React Scan disabled — adds 10-25ms overhead per frame by patching React's
// reconciler. Re-enable for visual re-render debugging, but expect 40-60 FPS
// instead of 120 FPS while it's active.
// if (typeof __DEV__ !== 'undefined' && __DEV__) {
//   void import('react-scan').then(({ scan }) => {
//     scan({ enabled: true, log: false });
//   });
// }

// Initialize Sentry before rendering using shared config for consistency
// This ensures release naming, privacy settings, and sampling rates match
// Editor app also uses getSentryConfig
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

// One-time cleanup: remove stale backend selection from pre-removal era
if (localStorage.getItem('orbit-backend-mode') !== null) {
  localStorage.removeItem('orbit-backend-mode');
}

// One-time cache reset (v3): purge both IndexedDB caches that were populated
// with the pre-settle-gated code. Old entries have `measured: true` on
// pre-Shiki placeholder heights, causing blank/overlap on revisit. Fresh
// caches rebuild from live renders with correct settle-gated measurements.
// Gated by a localStorage flag so it runs exactly once per user.
const CACHE_RESET_FLAG = 'orbit-cache-reset-v3';
const cacheResetPromise =
  localStorage.getItem(CACHE_RESET_FLAG) === '1'
    ? Promise.resolve()
    : Promise.all([
        new Promise<void>((resolve) => {
          const req = indexedDB.deleteDatabase('orbit-render-cache');
          req.onsuccess = (): void => {
            resolve();
          };
          req.onerror = (): void => {
            resolve();
          };
          req.onblocked = (): void => {
            resolve();
          };
        }),
        new Promise<void>((resolve) => {
          const req = indexedDB.deleteDatabase('orbit-streamdown-cache');
          req.onsuccess = (): void => {
            resolve();
          };
          req.onerror = (): void => {
            resolve();
          };
          req.onblocked = (): void => {
            resolve();
          };
        }),
      ]).then(() => {
        localStorage.setItem(CACHE_RESET_FLAG, '1');
      });

void cacheResetPromise.then(() => {
  void warmMemoryCacheFromIdb();
});
startViewportWidthTracking();

// Pre-fetch the last-active conversation into TanStack Query cache so that
// restoreSelection() → select() finds cached data (query-fast-path) or joins
// this in-flight fetch (join-path) instead of falling through to slow-path.
const lastActiveSessionId = claudeConversationRepo.restoreActiveSession();
if (lastActiveSessionId) {
  void loadConversationDetailFresh(lastActiveSessionId);
}

// Performance frame attribution monitor (dev-only, tree-shaken in production).
// Shows FPS badge + frame-drop attribution log. Toggle: Ctrl+Shift+M.
if (import.meta.env.DEV) {
  void import('./lib/perf').then(({ initPerfMonitor }) => {
    void initPerfMonitor();
  });
}

// Pre-warm Shiki syntax highlighting engine — forces WASM grammar load
// for ALL supported languages while the user views the sidebar. Sequential
// warming with yields to avoid blocking the main thread. Eliminates cold
// grammar stalls when switching to sessions with any language.
void import('@streamdown/code').then(({ code }) => {
  const languages = code.getSupportedLanguages();
  let i = 0;
  const warmNext = (): void => {
    const lang = languages[i];
    if (lang === undefined) return;
    i += 1;
    code.highlight(
      { code: 'x', language: lang, themes: ['github-light', 'github-dark'] },
      warmNext
    );
  };
  warmNext();
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
  <Sentry.ErrorBoundary fallback={RootErrorFallback}>
    <App />
  </Sentry.ErrorBoundary>
);
