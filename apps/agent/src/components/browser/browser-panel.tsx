import { AlertTriangle, Globe, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';

import { BrowserToolbar } from './browser-toolbar';

import type { FC } from 'react';

import { useTauri } from '@/hooks/agent/use-tauri';
import {
  selectFormattedIdleTime,
  selectIsBrowserRunning,
  selectShouldAutoClose,
  useBrowserLifecycleStore,
} from '@/stores/browser/browser-lifecycle-store';
import {
  useBrowserError,
  useBrowserIsActive,
  useBrowserStore,
} from '@/stores/browser/browser-store';
import { generateUUID } from '@/types/protocol';

// Inset to prevent webview from overlapping panel borders
const WEBVIEW_BORDER_INSET = 1;

export const BrowserPanel: FC = () => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const isActive = useBrowserIsActive();
  const error = useBrowserError();
  const { postMessage } = useTauri({});
  const { isCreating } = useBrowserStore();

  // Lifecycle store for idle tracking
  const lifecycleState = useBrowserLifecycleStore((s) => s.state);

  // On mount: Reset stale state if browser thinks it's active but lifecycle is idle
  // This handles the case where the app was restarted but localStorage has stale state
  useEffect(() => {
    const browserState = useBrowserStore.getState();
    const lifecycleState = useBrowserLifecycleStore.getState();

    if (browserState.isActive && lifecycleState.state === 'idle' && !browserState.isCreating) {
      // Stale state: browser store says active but lifecycle says idle
      // This means the webview was destroyed when app closed
      browserState.reset();
      lifecycleState.reset();
    }
  }, []);
  const isBrowserRunning = useBrowserLifecycleStore(selectIsBrowserRunning);
  const shouldAutoClose = useBrowserLifecycleStore(selectShouldAutoClose);
  const idleWarningShown = useBrowserLifecycleStore((s) => s.idleWarningShown);
  const formattedIdleTime = useBrowserLifecycleStore(selectFormattedIdleTime);
  const recordActivity = useBrowserLifecycleStore((s) => s.recordActivity);
  const tick = useBrowserLifecycleStore((s) => s.tick);

  // Launch embedded browser - creates a webview within the Orbit window
  const handleLaunchBrowser = useCallback((): void => {
    if (!viewportRef.current || isActive || isCreating) return;

    // Get viewport bounds for initial webview position
    // Apply inset to prevent webview from overlapping panel borders
    const rect = viewportRef.current.getBoundingClientRect();
    const bounds = {
      x: Math.round(rect.x) + WEBVIEW_BORDER_INSET,
      y: Math.round(rect.y),
      width: Math.round(rect.width) - WEBVIEW_BORDER_INSET,
      height: Math.round(rect.height),
      url: 'https://example.com', // Default URL
    };

    useBrowserStore.getState().setCreating(true);
    postMessage({
      type: 'browser:create',
      uuid: generateUUID(),
      bounds,
    });
  }, [isActive, isCreating, postMessage]);

  // Close browser handler
  const handleCloseBrowser = useCallback((): void => {
    postMessage({
      type: 'browser:clear',
      uuid: generateUUID(),
    });
  }, [postMessage]);

  // Keep open handler - resets idle timer when user clicks "Keep Open"
  const handleKeepOpen = useCallback((): void => {
    recordActivity();
  }, [recordActivity]);

  // Tick idle timer every second when browser is running
  useEffect(() => {
    if (!isBrowserRunning) return;

    const intervalId = setInterval(() => {
      tick();
    }, 1000);

    return (): void => {
      clearInterval(intervalId);
    };
  }, [isBrowserRunning, tick]);

  // Auto-close when idle timeout expires
  useEffect(() => {
    if (shouldAutoClose) {
      handleCloseBrowser();
    }
  }, [shouldAutoClose, handleCloseBrowser]);

  // User activity detection - record activity on mouse/keyboard in viewport
  // Throttled to avoid excessive updates (30 second minimum between recordings)
  useEffect(() => {
    if (!viewportRef.current || !isBrowserRunning) return;

    const viewport = viewportRef.current;
    let lastRecordedAt = 0;
    const THROTTLE_MS = 30_000; // Only record activity every 30 seconds

    const handleActivity = (): void => {
      const now = Date.now();
      if (now - lastRecordedAt >= THROTTLE_MS) {
        lastRecordedAt = now;
        recordActivity();
      }
    };

    viewport.addEventListener('mousemove', handleActivity);
    viewport.addEventListener('mousedown', handleActivity);
    viewport.addEventListener('keydown', handleActivity);

    return (): void => {
      viewport.removeEventListener('mousemove', handleActivity);
      viewport.removeEventListener('mousedown', handleActivity);
      viewport.removeEventListener('keydown', handleActivity);
    };
  }, [isBrowserRunning, recordActivity]);

  // Report bounds when viewport changes (for repositioning embedded webview)
  useEffect(() => {
    if (!viewportRef.current || !isActive) return;

    let lastBounds = { x: 0, y: 0, width: 0, height: 0 };
    let rafId: number | null = null;

    const updateBounds = (): void => {
      // Use requestAnimationFrame to ensure layout is complete
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (!viewportRef.current) return;
        // Apply inset to prevent webview from overlapping panel borders
        const rect = viewportRef.current.getBoundingClientRect();
        const bounds = {
          x: Math.round(rect.x) + WEBVIEW_BORDER_INSET,
          y: Math.round(rect.y),
          width: Math.round(rect.width) - WEBVIEW_BORDER_INSET,
          height: Math.round(rect.height),
        };

        // Only send if bounds actually changed
        if (
          bounds.x !== lastBounds.x ||
          bounds.y !== lastBounds.y ||
          bounds.width !== lastBounds.width ||
          bounds.height !== lastBounds.height
        ) {
          lastBounds = bounds;
          postMessage({
            type: 'browser:bounds',
            uuid: generateUUID(),
            bounds,
          });
        }
      });
    };

    // Initial bounds report (with small delay to ensure layout is ready)
    const initTimeout = setTimeout(updateBounds, 50);

    // Watch for resize of the viewport
    const resizeObserver = new ResizeObserver(updateBounds);
    resizeObserver.observe(viewportRef.current);

    // Also watch parent elements for resize (for when devtools/panels open/close)
    let parent = viewportRef.current.parentElement;
    while (parent && parent !== document.body) {
      resizeObserver.observe(parent);
      parent = parent.parentElement;
    }

    // Listen for window resize
    window.addEventListener('resize', updateBounds);

    // Also update on scroll (in case webview is scrolled)
    window.addEventListener('scroll', updateBounds, true);

    return (): void => {
      clearTimeout(initTimeout);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateBounds);
      window.removeEventListener('scroll', updateBounds, true);
    };
  }, [isActive, postMessage]);

  // Navigation handlers
  const handleBack = useCallback((): void => {
    postMessage({ type: 'browser:back', uuid: generateUUID() });
  }, [postMessage]);

  const handleForward = useCallback((): void => {
    postMessage({ type: 'browser:forward', uuid: generateUUID() });
  }, [postMessage]);

  const handleReload = useCallback((): void => {
    postMessage({ type: 'browser:reload', uuid: generateUUID() });
  }, [postMessage]);

  const handleStop = useCallback((): void => {
    postMessage({ type: 'browser:stop', uuid: generateUUID() });
  }, [postMessage]);

  const handleNavigate = useCallback(
    (url: string): void => {
      postMessage({
        type: 'browser:navigate',
        uuid: generateUUID(),
        url,
      });
    },
    [postMessage]
  );

  // Element selection handlers
  const handleSelectElement = useCallback((): void => {
    postMessage({
      type: 'browser:select-element:start',
      uuid: generateUUID(),
    });
  }, [postMessage]);

  const handleCancelSelectElement = useCallback((): void => {
    postMessage({
      type: 'browser:select-element:cancel',
      uuid: generateUUID(),
    });
  }, [postMessage]);

  // DevTools handler
  const handleOpenDevTools = useCallback((): void => {
    postMessage({
      type: 'browser:devtools',
      uuid: generateUUID(),
    });
  }, [postMessage]);

  return (
    <div className="h-full w-full flex flex-col bg-background">
      {/* Toolbar */}
      <BrowserToolbar
        onBack={handleBack}
        onForward={handleForward}
        onReload={handleReload}
        onStop={handleStop}
        onNavigate={handleNavigate}
        onSelectElement={handleSelectElement}
        onCancelSelectElement={handleCancelSelectElement}
        {...(isActive ? { onOpenDevTools: handleOpenDevTools, onClose: handleCloseBrowser } : {})}
      />

      {/* Idle warning banner - shows when browser is inactive */}
      {idleWarningShown && formattedIdleTime ? (
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-amber-500/10 border-b border-amber-500/30">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm">
              Browser will close in {formattedIdleTime} due to inactivity
            </span>
          </div>
          <button
            onClick={handleKeepOpen}
            className="px-3 py-1 text-xs font-medium bg-amber-500/20 text-amber-700 dark:text-amber-300 rounded hover:bg-amber-500/30 transition-colors"
          >
            Keep Open
          </button>
        </div>
      ) : null}

      {/* Viewport area - Embedded webview will be positioned here */}
      <div ref={viewportRef} className="flex-1 relative bg-muted/30">
        {/* Loading state */}
        {isCreating || lifecycleState === 'starting' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="text-sm">Starting browser...</span>
          </div>
        ) : null}

        {/* Closing state */}
        {lifecycleState === 'closing' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="text-sm">Closing browser...</span>
          </div>
        ) : null}

        {/* Error state */}
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-destructive">
            <span className="text-sm text-center px-4">{error}</span>
            <button
              onClick={(): void => {
                useBrowserStore.getState().reset();
                useBrowserLifecycleStore.getState().reset();
              }}
              className="px-3 py-1 text-xs font-medium bg-muted text-muted-foreground rounded hover:bg-muted/80 transition-colors"
            >
              Reset
            </button>
          </div>
        ) : null}

        {/* Empty state (before browser is created) */}
        {!isActive && !isCreating && !error && lifecycleState === 'idle' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-muted-foreground">
            <Globe className="h-12 w-12 opacity-50" />
            <span className="text-sm">Browser not active</span>
            <button
              onClick={handleLaunchBrowser}
              className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              Launch Browser
            </button>
          </div>
        ) : null}

        {/* Reset button for stuck states */}
        {(isActive || lifecycleState !== 'idle') &&
        !isCreating &&
        !error &&
        lifecycleState !== 'starting' &&
        lifecycleState !== 'closing' ? (
          <div className="absolute bottom-4 right-4">
            <button
              onClick={(): void => {
                useBrowserStore.getState().reset();
                useBrowserLifecycleStore.getState().reset();
              }}
              className="px-3 py-1 text-xs font-medium bg-muted text-muted-foreground rounded hover:bg-muted/80 transition-colors"
            >
              Reset Browser State
            </button>
          </div>
        ) : null}

        {/* When active, the embedded webview renders within this area */}
        {/* The webview is created as a true Tauri webview, not an overlay */}
      </div>
    </div>
  );
};
