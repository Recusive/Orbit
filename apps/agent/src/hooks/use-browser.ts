import { useCallback, useEffect, useRef } from 'react';

import type { ExtensionMessage } from '@/types/protocol';

import { useTauri } from '@/hooks/use-tauri';
import { useBrowserStore } from '@/stores/browser-store';
import { useUIStore } from '@/stores/ui-store';
import { generateUUID } from '@/types/protocol';

// Track pending browser:open requests to navigate after creation
let pendingNavigationUrl: string | null = null;

/**
 * Hook to handle browser messages from Tauri backend
 */
export function useBrowser(): void {
  const {
    setViewId,
    setNavigation,
    setLoading,
    setSelectedElement,
    setSelectingElement,
    setError,
    reset,
  } = useBrowserStore();

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

          // 2. If browser is not active, create it and queue navigation
          if (!browserState.isActive && !browserState.isCreating) {
            pendingNavigationUrl = url;
            useBrowserStore.getState().setCreating(true);
            postMessage({
              type: 'browser:create',
              uuid: generateUUID(),
            });
          } else if (browserState.isActive) {
            // Browser already active, just navigate
            postMessage({
              type: 'browser:navigate',
              uuid: generateUUID(),
              url,
            });
          }
          break;
        }

        // browser:close - command from extension to close browser panel
        case 'browser:close': {
          // Switch to a different tab (files is the default)
          useUIStore.getState().setActivityTab('files');
          break;
        }

        // Browser messages
        case 'browser:created':
          setViewId(message.viewId);
          setError(null);
          // Check if there's a pending navigation from browser:open
          if (pendingNavigationUrl) {
            postMessage({
              type: 'browser:navigate',
              uuid: generateUUID(),
              url: pendingNavigationUrl,
            });
            pendingNavigationUrl = null;
          }
          break;

        case 'browser:navigated':
          setNavigation({
            url: message.url,
            title: message.title,
            canGoBack: message.canGoBack,
            canGoForward: message.canGoForward,
            isLoading: message.isLoading,
          });
          break;

        case 'browser:loading':
          setLoading(message.isLoading);
          break;

        case 'browser:element-selected':
          setSelectedElement(message.element);
          break;

        case 'browser:error':
          setError(message.error);
          setSelectingElement(false);
          break;

        case 'browser:destroyed':
          reset();
          break;

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
      setViewId,
      setNavigation,
      setLoading,
      setSelectedElement,
      setSelectingElement,
      setError,
      reset,
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
      setTimeout(() => {
        postMessage({
          type: 'browser:show',
          uuid: generateUUID(),
        });
      }, 100);
    }
  }, [postMessage]);

  // Subscribe to backend messages
  useTauri({ onMessage: handleMessage });
}
