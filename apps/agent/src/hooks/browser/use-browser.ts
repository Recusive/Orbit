import { createLogger } from '@orbit/common/lib';
import { useCallback, useEffect } from 'react';
import { useShallow } from 'zustand/shallow';

import type { ExtensionMessage, ReactElementContext } from '@/types/protocol';

import { executeBrowserTool } from '@/hooks/agent/handlers/browser-tool-handler';
import { useTauri } from '@/hooks/agent/use-tauri';
import { onBrowserElementEnriched, onBrowserElementSelected } from '@/lib/api/browser';
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
    enrichElementContext,
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
      enrichElementContext: s.enrichElementContext,
    }))
  );

  // Get postMessage for sending browser:show when panel becomes visible
  const { postMessage } = useTauri({});

  const handleMessage = useCallback(
    (message: ExtensionMessage): void => {
      switch (message.type) {
        // panel:visible — legacy VS Code event; browser visibility is now managed
        // by the consolidated effect in ActivityPanel (canManageBrowser gate).
        case 'panel:visible':
          break;

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
          useUIStore.getState().setActivityTab('source');
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

        case 'browser:element-enriched':
          enrichElementContext(message.patch);
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
        case 'skills:list:response':
        case 'skills:error':
        case 'agent:compact_complete':
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
      enrichElementContext,
      postMessage,
    ]
  );

  // Bridge Tauri `browser:element-selected` event → window.postMessage.
  // The Rust on_navigation handler intercepts `orbit-eval://element-selected?data=...`
  // from the react-grab plugin and emits this event. We bridge it into the
  // existing ExtensionMessage flow so the switch/case above handles it.
  useEffect(() => {
    const unlistenPromise = onBrowserElementSelected((data: string) => {
      try {
        const element = JSON.parse(data) as ReactElementContext;
        window.postMessage(
          {
            type: 'browser:element-selected',
            uuid: generateUUID(),
            element,
          },
          '*'
        );
      } catch (err) {
        logger.error(
          'Failed to parse element selection data',
          err instanceof Error ? err : new Error(String(err))
        );
      }
    });

    return (): void => {
      void unlistenPromise
        .then((dispose) => {
          dispose();
        })
        .catch((err: unknown) => {
          logger.warn('Failed to unlisten browser element selection handler', { err });
        });
    };
  }, []);

  // Bridge Tauri `browser:element-enriched` event → window.postMessage.
  // Deferred React source metadata arrives after the initial element selection.
  useEffect(() => {
    const unlistenPromise = onBrowserElementEnriched((data: string) => {
      try {
        const patch = JSON.parse(data) as {
          selector: string;
          epoch: number;
          componentName: string;
          filePath: string;
          lineNumber: number;
        };
        window.postMessage(
          {
            type: 'browser:element-enriched',
            uuid: generateUUID(),
            patch,
          },
          '*'
        );
      } catch (err) {
        logger.error(
          'Failed to parse element enrichment data',
          err instanceof Error ? err : new Error(String(err))
        );
      }
    });

    return (): void => {
      void unlistenPromise
        .then((dispose) => {
          dispose();
        })
        .catch((err: unknown) => {
          logger.warn('Failed to unlisten browser element enrichment handler', { err });
        });
    };
  }, []);

  // Browser visibility on mount is handled by ActivityPanel's consolidated effect.
  // No mount-time browser:show needed here — ActivityPanel fires it when
  // isBrowserActive is true and activeTab === 'browser'.

  // Subscribe to backend messages
  useTauri({ onMessage: handleMessage });
}
