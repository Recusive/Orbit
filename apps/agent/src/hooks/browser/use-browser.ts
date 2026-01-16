import { createLogger } from '@orbit/common/lib';
import { useCallback, useEffect, useRef } from 'react';
import { useShallow } from 'zustand/shallow';

import type { ExtensionMessage } from '@/types/protocol';

import { executeBrowserTool } from '@/hooks/agent/handlers/browser-tool-handler';
import { useTauri } from '@/hooks/agent/use-tauri';
import { useBrowserStore } from '@/stores/browser/browser-store';
import { useUIStore } from '@/stores/ui/ui-store';
import { generateUUID } from '@/types/protocol';

const logger = createLogger('Browser');

/**
 * Hook to handle browser messages from Tauri backend
 */
export function useBrowser(): void {
  // Use useShallow to prevent re-renders when unrelated store state changes
  const {
    setNavigation,
    setLoading,
    setSelectedElement,
    setSelectingElement,
    setError,
    reset,
    setViewId,
    setCreating,
  } = useBrowserStore(
    useShallow((s) => ({
      setNavigation: s.setNavigation,
      setLoading: s.setLoading,
      setSelectedElement: s.setSelectedElement,
      setSelectingElement: s.setSelectingElement,
      setError: s.setError,
      reset: s.reset,
      setViewId: s.setViewId,
      setCreating: s.setCreating,
    }))
  );

  // Get postMessage for sending browser:show when panel becomes visible
  const { postMessage } = useTauri({});

  const handleMessage = useCallback(
    (message: ExtensionMessage): void => {
      switch (message.type) {
        // Handle panel visibility - show browser when VS Code panel becomes visible
        case 'panel:visible': {
          const browserState = useBrowserStore.getState();
          const uiState = useUIStore.getState();

          if (browserState.isActive && uiState.activityTab === 'browser') {
            postMessage({
              type: 'browser:show',
              uuid: generateUUID(),
            });
          }
          break;
        }

        // browser:open - command from extension to open browser panel and navigate
        case 'browser:open': {
          const browserState = useBrowserStore.getState();
          const url = message.url ?? 'about:blank';

          // 1. Open the activity panel with browser tab
          useUIStore.getState().openBrowserTab();

          // 2. If browser is already active, navigate directly
          if (browserState.isActive) {
            postMessage({
              type: 'browser:navigate',
              uuid: generateUUID(),
              url,
            });
          } else {
            // Browser not active - store the pending URL
            // browser-panel will pick this up when it creates the embedded browser
            logger.info('Storing pending navigation URL for browser creation', { url });
            useBrowserStore.getState().setPendingNavigationUrl(url);
          }
          break;
        }

        // browser:close - command from extension to close browser panel
        case 'browser:close': {
          // Switch to a different tab (files is the default)
          useUIStore.getState().setActivityTab('files');
          break;
        }

        case 'browser:tool_request': {
          const { session_id, request } = message;
          void (async () => {
            const result = await executeBrowserTool(request.toolName, request.toolInput);
            postMessage({
              type: 'browser:tool_response',
              uuid: generateUUID(),
              session_id,
              response: {
                requestId: request.requestId,
                ...result,
              },
            });
          })();
          break;
        }

        // Browser messages
        case 'browser:detected':
          // Legacy external browser detection - no longer used
          break;

        case 'browser:navigated': {
          // Build partial navigation update - only include fields that are provided
          // This preserves previous values (e.g., title) when backend doesn't provide them
          // canGoBack/canGoForward left as null (unknown) if not provided from WebKit
          const navUpdate: Parameters<typeof setNavigation>[0] = {
            url: message.url,
          };
          // Only update title if provided (preserves previous title otherwise)
          if (message.title !== undefined) navUpdate.title = message.title;
          if (message.canGoBack !== undefined) navUpdate.canGoBack = message.canGoBack;
          if (message.canGoForward !== undefined) navUpdate.canGoForward = message.canGoForward;
          if (message.isLoading !== undefined) navUpdate.isLoading = message.isLoading;
          setNavigation(navUpdate);
          break;
        }

        case 'browser:loading':
          setLoading(message.isLoading);
          break;

        case 'browser:element-selected':
          setSelectedElement(message.element);
          break;

        case 'browser:error':
          logger.error('Browser error', new Error(message.error));
          setError(message.error);
          setSelectingElement(false);
          break;

        case 'browser:cleared':
          reset();
          break;

        case 'browser:created': {
          // Handle browser creation - works in both Tauri and mock mode
          // In Tauri mode, browser-handlers.ts also handles this for lifecycle store
          logger.info('Browser created', { label: message.label, url: message.url });
          setViewId(message.label);
          setCreating(false);
          setError(null);

          // Consume pending navigation URL if browser_open arrived during creation
          const pendingUrl = useBrowserStore.getState().pendingNavigationUrl;
          if (pendingUrl) {
            useBrowserStore.getState().setPendingNavigationUrl(null);
            postMessage({
              type: 'browser:navigate',
              uuid: generateUUID(),
              url: pendingUrl,
            });
          }
          break;
        }

        // Ignore non-browser messages - handled elsewhere
        case 'error':
        case 'system:init':
        case 'layout':
        case 'agent:chunk':
        case 'agent:thinking':
        case 'agent:complete':
        case 'agent:error':
        case 'agent:plan_mode':
        case 'agent:accept_mode':
        case 'agent:checkpoint':
        case 'tool:start':
        case 'tool:end':
        case 'permission:request':
        case 'inputMode:changed':
        case 'thinking:changed':
        case 'model:changed':
        case 'panel:command':
        case 'terminal:output':
        case 'terminal:data':
        case 'terminal:created':
        case 'terminal:exited':
        case 'terminal:cwd':
        case 'terminal:command:start':
        case 'terminal:command:end':
        case 'terminal:capabilities':
        case 'terminal:title':
        case 'terminal:foreground':
        case 'file:content':
        case 'file:changed':
        case 'file:written':
        case 'file:tree:response':
        case 'file:tree:error':
        case 'file:list:response':
        case 'conversation:list':
        case 'conversation:created':
        case 'conversation:deleted':
        case 'conversation:loading':
        case 'conversation:loaded':
        case 'conversation:rewound':
        case 'subagents:list:response':
        case 'subagents:created':
        case 'subagents:updated':
        case 'subagents:deleted':
        case 'subagents:error':
        case 'subagents:generated':
        case 'commands:list:response':
        case 'commands:created':
        case 'commands:updated':
        case 'commands:deleted':
        case 'commands:error':
        case 'commands:generated':
          break;
      }
    },
    [
      setNavigation,
      setLoading,
      setSelectedElement,
      setSelectingElement,
      setError,
      reset,
      setViewId,
      setCreating,
      postMessage,
    ]
  );

  // Track if we've already sent browser:show on mount
  const hasShownBrowserRef = useRef(false);

  // On mount, if we have a persisted active browser, tell Orbit to show it
  useEffect(() => {
    if (hasShownBrowserRef.current) return;

    const browserState = useBrowserStore.getState();
    const uiState = useUIStore.getState();

    // If we have a viewId from localStorage (persisted through reload) and browser tab is active
    if (browserState.isActive && browserState.viewId && uiState.activityTab === 'browser') {
      hasShownBrowserRef.current = true;
      // Small delay to ensure Orbit is ready
      const timeoutId = setTimeout(() => {
        postMessage({
          type: 'browser:show',
          uuid: generateUUID(),
        });
      }, 100);

      return (): void => {
        clearTimeout(timeoutId);
      };
    }

    return undefined;
  }, [postMessage]);

  // Subscribe to backend messages
  useTauri({ onMessage: handleMessage });
}
