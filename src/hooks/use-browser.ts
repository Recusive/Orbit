import { useCallback } from 'react';

import type { ExtensionMessage } from '@/types/protocol';

import { useVSCode } from '@/hooks/use-vscode';
import { useBrowserStore } from '@/stores/browser-store';
import { useUIStore } from '@/stores/ui-store';
import { generateUUID } from '@/types/protocol';

// Track pending browser:open requests to navigate after creation
let pendingNavigationUrl: string | null = null;

/**
 * Hook to handle browser messages from Orbit extension
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
  const { postMessage } = useVSCode({});

  const handleMessage = useCallback((message: ExtensionMessage): void => {
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
      case 'file:content':
      case 'file:changed':
      case 'file:written':
      case 'file:tree:response':
      case 'file:tree:error':
      case 'file:list:response':
      case 'conversation:list':
      case 'conversation:created':
      case 'conversation:deleted':
      case 'conversation:loaded':
      case 'conversation:rewound':
        break;
    }
  }, [setViewId, setNavigation, setLoading, setSelectedElement, setSelectingElement, setError, reset, postMessage]);

  // Subscribe to extension messages
  useVSCode({ onMessage: handleMessage });
}
