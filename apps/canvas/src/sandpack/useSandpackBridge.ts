import { useCallback, useEffect, useRef } from 'react';

import type { ViewportType } from './sandpackConfig';

// Message types from Agent/Canvas → Sandbox
export interface AgentToSandboxMessage {
  type: 'update-code' | 'viewport-change' | 'reset';
  nodeId: string;
  payload?: {
    code?: string;
    viewport?: ViewportType;
  };
}

// Message types from Sandbox → Agent/Canvas
export interface SandboxToAgentMessage {
  type: 'component-rendered' | 'component-error' | 'component-ready' | 'user-interaction';
  nodeId: string;
  payload?: {
    dimensions?: { width: number; height: number };
    error?: string;
    errorStack?: string;
    event?: 'click' | 'hover' | 'input';
    target?: string;
  };
}

// Combined message type
export type BridgeMessage = AgentToSandboxMessage | SandboxToAgentMessage;

export interface UseSandpackBridgeOptions {
  nodeId: string;
  onComponentReady?: (nodeId: string) => void;
  onComponentError?: (nodeId: string, error: string, stack?: string) => void;
  onComponentRendered?: (nodeId: string, dimensions: { width: number; height: number }) => void;
  onUserInteraction?: (nodeId: string, event: string, target: string) => void;
}

/**
 * Hook for bidirectional communication between Sandpack sandbox and main canvas
 * Enables:
 * - Error feedback loop for AI agent
 * - User interaction reporting
 * - Component dimension reporting
 */
export function useSandpackBridge({
  nodeId,
  onComponentReady,
  onComponentError,
  onComponentRendered,
  onUserInteraction,
}: UseSandpackBridgeOptions): {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  sendToSandbox: (message: AgentToSandboxMessage) => void;
  updateCode: (code: string) => void;
  changeViewport: (viewport: ViewportType) => void;
  resetSandbox: () => void;
} {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Handle incoming messages from sandbox
  const handleMessage = useCallback(
    (event: MessageEvent): void => {
      // Security: Only accept messages from same origin or trusted sources
      if (event.origin !== window.location.origin && event.origin !== 'null') {
        return;
      }

      const message = event.data as SandboxToAgentMessage;

      // Only process messages for this node
      if (message.nodeId !== nodeId) {
        return;
      }

      switch (message.type) {
        case 'component-ready':
          onComponentReady?.(nodeId);
          break;

        case 'component-error':
          onComponentError?.(
            nodeId,
            message.payload?.error ?? 'Unknown error',
            message.payload?.errorStack
          );
          break;

        case 'component-rendered':
          if (message.payload?.dimensions !== undefined) {
            onComponentRendered?.(nodeId, message.payload.dimensions);
          }
          break;

        case 'user-interaction':
          if (message.payload?.event !== undefined && message.payload.target !== undefined) {
            onUserInteraction?.(nodeId, message.payload.event, message.payload.target);
          }
          break;
      }
    },
    [nodeId, onComponentReady, onComponentError, onComponentRendered, onUserInteraction]
  );

  // Subscribe to window messages
  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [handleMessage]);

  // Send message to sandbox iframe
  const sendToSandbox = useCallback((message: AgentToSandboxMessage): void => {
    if (
      iframeRef.current?.contentWindow !== null &&
      iframeRef.current?.contentWindow !== undefined
    ) {
      iframeRef.current.contentWindow.postMessage(message, '*');
    }
  }, []);

  // Helper to update code in sandbox
  const updateCode = useCallback(
    (code: string): void => {
      sendToSandbox({
        type: 'update-code',
        nodeId,
        payload: { code },
      });
    },
    [nodeId, sendToSandbox]
  );

  // Helper to change viewport
  const changeViewport = useCallback(
    (viewport: ViewportType): void => {
      sendToSandbox({
        type: 'viewport-change',
        nodeId,
        payload: { viewport },
      });
    },
    [nodeId, sendToSandbox]
  );

  // Helper to reset sandbox
  const resetSandbox = useCallback((): void => {
    sendToSandbox({
      type: 'reset',
      nodeId,
    });
  }, [nodeId, sendToSandbox]);

  return {
    iframeRef,
    sendToSandbox,
    updateCode,
    changeViewport,
    resetSandbox,
  };
}

/**
 * Script to inject into Sandpack preview for communication bridge
 * This script runs inside the sandbox iframe
 */
export const BRIDGE_SCRIPT = `
(function() {
	const nodeId = window.__ORBIT_NODE_ID__;
	if (!nodeId) return;

	// Report when component is ready
	window.addEventListener('load', () => {
		window.parent.postMessage({
			type: 'component-ready',
			nodeId: nodeId
		}, '*');
	});

	// Report component dimensions after render
	const reportDimensions = () => {
		const root = document.getElementById('root');
		if (root) {
			window.parent.postMessage({
				type: 'component-rendered',
				nodeId: nodeId,
				payload: {
					dimensions: {
						width: root.scrollWidth,
						height: root.scrollHeight
					}
				}
			}, '*');
		}
	};

	// Observe DOM changes to report dimensions
	const observer = new MutationObserver(reportDimensions);
	observer.observe(document.body, { childList: true, subtree: true });

	// Report errors to parent
	window.onerror = (message, source, lineno, colno, error) => {
		window.parent.postMessage({
			type: 'component-error',
			nodeId: nodeId,
			payload: {
				error: message,
				errorStack: error?.stack
			}
		}, '*');
		return false;
	};

	// Report unhandled promise rejections
	window.onunhandledrejection = (event) => {
		window.parent.postMessage({
			type: 'component-error',
			nodeId: nodeId,
			payload: {
				error: event.reason?.message ?? event.reason,
				errorStack: event.reason?.stack
			}
		}, '*');
	};

	// Highlight style for hover
	const highlightStyle = document.createElement('style');
	highlightStyle.textContent = \`
		[data-source-loc]:hover {
			outline: 2px solid rgba(59, 130, 246, 0.6) !important;
			outline-offset: 2px !important;
			cursor: pointer !important;
		}
		[data-source-loc].orbit-selected {
			outline: 2px solid rgba(34, 197, 94, 0.8) !important;
			outline-offset: 2px !important;
		}
	\`;
	document.head.appendChild(highlightStyle);

	// Report user interactions - detect clicks on data-source-loc elements
	document.addEventListener('click', (e) => {
		const target = e.target as Element;
		const tagName = target.tagName.toLowerCase();
		const className = (target as HTMLElement).className || '';
		const id = (target as HTMLElement).id || '';

		// Check if click is on an element with data-source-loc
		const sourceLocEl = target.closest('[data-source-loc]');
		const sourceLoc = sourceLocEl?.getAttribute('data-source-loc') || null;
		const rect = sourceLocEl?.getBoundingClientRect() || null;

		// If clicking on a source-loc element, prevent default to avoid link navigation etc.
		if (sourceLoc) {
			e.preventDefault();
			e.stopPropagation();
		}

		window.parent.postMessage({
			type: 'user-interaction',
			nodeId: nodeId,
			payload: {
				event: 'click',
				target: id ?? className ?? tagName,
				sourceLoc: sourceLoc,
				rect: rect ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height } : null
			}
		}, '*');
	}, true);

	// Listen for messages from parent
	window.addEventListener('message', (event) => {
		const msg = event.data;
		if (!msg || msg.nodeId !== nodeId) return;

		if (msg.type === 'reset') {
			location.reload();
		}
	});
})();
`;

/**
 * Generate the bridge script with node ID embedded
 */
export function generateBridgeScript(nodeId: string): string {
  return `window.__ORBIT_NODE_ID__ = ${JSON.stringify(nodeId)};${BRIDGE_SCRIPT}`;
}
