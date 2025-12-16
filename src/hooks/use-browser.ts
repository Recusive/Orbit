import { useCallback } from 'react';

import type { ExtensionMessage } from '@/types/protocol';

import { useVSCode } from '@/hooks/use-vscode';
import { useBrowserStore } from '@/stores/browser-store';
import { isProtocolBrowserMessage } from '@/types/protocol';

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

  const handleMessage = useCallback((message: ExtensionMessage): void => {
    // Only handle browser messages
    if (!message.type.startsWith('browser:')) return;

    switch (message.type) {
      case 'browser:created':
        setViewId(message.viewId);
        setError(null);
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
  }, [setViewId, setNavigation, setLoading, setSelectedElement, setSelectingElement, setError, reset]);

  // Subscribe to extension messages
  useVSCode({ onMessage: handleMessage });
}

// Re-export the type guard for use elsewhere
export { isProtocolBrowserMessage };
