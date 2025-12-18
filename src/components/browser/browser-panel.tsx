import { Globe, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';

import { BrowserToolbar } from './browser-toolbar';

import type { FC } from 'react';


import { useVSCode } from '@/hooks/use-vscode';
import {
  useBrowserStore,
  useBrowserIsActive,
  useBrowserError,
} from '@/stores/browser-store';
import { generateUUID } from '@/types/protocol';

export interface BrowserPanelProps {
  readonly width: number;
}

export const BrowserPanel: FC<BrowserPanelProps> = ({ width }) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const isActive = useBrowserIsActive();
  const error = useBrowserError();
  const { postMessage } = useVSCode({});
  const {
    isCreating,
    // setCreating, // Disabled - see browser creation comment below
  } = useBrowserStore();

  // Create browser view - triggered by user clicking "Launch Browser" button
  // Auto-creation disabled due to coordinate system issues
  const handleLaunchBrowser = useCallback((): void => {
    if (!isActive && !isCreating) {
      useBrowserStore.getState().setCreating(true);
      postMessage({
        type: 'browser:create',
        uuid: generateUUID(),
      });
    }
  }, [isActive, isCreating, postMessage]);

  // Report bounds when viewport changes
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
        const rect = viewportRef.current.getBoundingClientRect();
        const bounds = {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };

        // Only send if bounds actually changed
        if (bounds.x !== lastBounds.x || bounds.y !== lastBounds.y ||
            bounds.width !== lastBounds.width || bounds.height !== lastBounds.height) {
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

  const handleNavigate = useCallback((url: string): void => {
    postMessage({
      type: 'browser:navigate',
      uuid: generateUUID(),
      url,
    });
  }, [postMessage]);

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

  // Close/destroy browser handler
  const handleCloseBrowser = useCallback((): void => {
    postMessage({
      type: 'browser:destroy',
      uuid: generateUUID(),
    });
  }, [postMessage]);

  return (
    <div className="h-full flex flex-col bg-background" style={{ width }}>
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

      {/* Viewport area - BrowserView will be positioned over this */}
      <div
        ref={viewportRef}
        className="flex-1 relative bg-muted/30"
      >
        {/* Loading state */}
        {isCreating ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="text-sm">Starting browser...</span>
          </div>
        ) : null}

        {/* Error state */}
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-destructive">
            <span className="text-sm">{error}</span>
          </div>
        ) : null}

        {/* Empty state (before browser is created) */}
        {!isActive && !isCreating && !error ? (
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

        {/* When active, the BrowserView renders natively over this area */}
        {/* The div provides the bounds for positioning */}
      </div>
    </div>
  );
};
