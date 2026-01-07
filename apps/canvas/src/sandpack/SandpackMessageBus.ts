/**
 * SandpackMessageBus - Centralized message routing for multiple Sandpack iframes
 *
 * Routes postMessage events to specific instances by instanceId.
 * Provides subscribe/unsubscribe pattern for per-instance handlers.
 */

import type { ViewportType } from './sandpackConfig';

// Message types from Canvas → Sandbox
export interface CanvasToSandboxMessage {
  type:
    | 'update-code'
    | 'viewport-change'
    | 'reset'
    | 'get-aria-snapshot'
    | 'get-computed-styles'
    | 'get-element-bounds'
    | 'verify-component';
  instanceId: string;
  nodeId: string;
  requestId?: string;
  payload?: {
    code?: string;
    viewport?: ViewportType;
    selector?: string;
    properties?: string[];
    includeHidden?: boolean;
    includeChildren?: boolean;
    expectedElements?: string[];
  };
}

// Message types from Sandbox → Canvas
export interface SandboxToCanvasMessage {
  type:
    | 'component-ready'
    | 'component-error'
    | 'component-rendered'
    | 'user-interaction'
    | 'aria-snapshot-result'
    | 'computed-styles-result'
    | 'element-bounds-result'
    | 'verify-result';
  instanceId: string;
  nodeId: string;
  requestId?: string;
  payload?: {
    dimensions?: { width: number; height: number };
    error?: string;
    errorStack?: string;
    event?: 'click' | 'hover' | 'input';
    target?: string;
    sourceLoc?: string | null;
    rect?: { top: number; left: number; width: number; height: number } | null;
    // Perception results
    ariaTree?: unknown;
    textRepresentation?: string;
    elementCount?: number;
    styles?: Record<string, { raw: string }>;
    matchCount?: number;
    elements?: unknown[];
    viewport?: { width: number; height: number };
    rendered?: boolean;
    errors?: string[];
    ariaSummary?: string;
    foundElements?: string[];
    missingElements?: string[];
  };
}

export type BusMessage = CanvasToSandboxMessage | SandboxToCanvasMessage;

type MessageHandler = (message: SandboxToCanvasMessage) => void;

interface Subscription {
  instanceId: string;
  handler: MessageHandler;
}

class MessageBus {
  private subscriptions = new Map<string, Subscription>();
  private globalListenerAttached = false;

  constructor() {
    this.attachGlobalListener();
  }

  private attachGlobalListener(): void {
    if (this.globalListenerAttached) return;

    window.addEventListener('message', this.handleMessage);
    this.globalListenerAttached = true;
  }

  private handleMessage = (event: MessageEvent<unknown>): void => {
    // Security check
    if (event.origin !== window.location.origin && event.origin !== 'null') {
      return;
    }

    const message = event.data;
    if (
      message === null ||
      message === undefined ||
      typeof message !== 'object' ||
      !('type' in message)
    ) {
      return;
    }

    const typedMessage = message as Record<string, unknown>;
    const instanceId =
      typeof typedMessage['instanceId'] === 'string' ? typedMessage['instanceId'] : undefined;
    if (!instanceId) {
      // Legacy message without instanceId - broadcast to all matching nodeId handlers
      const nodeId =
        typeof typedMessage['nodeId'] === 'string' ? typedMessage['nodeId'] : undefined;
      if (nodeId) {
        for (const sub of this.subscriptions.values()) {
          sub.handler(message as SandboxToCanvasMessage);
        }
      }
      return;
    }

    // Route to specific instance handler
    const subscription = this.subscriptions.get(instanceId);
    if (subscription) {
      subscription.handler(message as SandboxToCanvasMessage);
    }
  };

  /**
   * Subscribe to messages for a specific instance
   */
  subscribe(instanceId: string, handler: MessageHandler): () => void {
    this.subscriptions.set(instanceId, { instanceId, handler });

    // Return unsubscribe function
    return (): void => {
      this.subscriptions.delete(instanceId);
    };
  }

  /**
   * Send message to a specific instance's iframe
   */
  send(iframeRef: HTMLIFrameElement | null, message: CanvasToSandboxMessage): void {
    if (iframeRef?.contentWindow) {
      iframeRef.contentWindow.postMessage(message, '*');
    }
  }

  /**
   * Broadcast message to all instances
   */
  broadcast(
    iframes: Map<string, HTMLIFrameElement | null>,
    message: Omit<CanvasToSandboxMessage, 'instanceId'>
  ): void {
    for (const [instanceId, iframe] of iframes) {
      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage({ ...message, instanceId }, '*');
      }
    }
  }

  /**
   * Clean up
   */
  destroy(): void {
    window.removeEventListener('message', this.handleMessage);
    this.subscriptions.clear();
    this.globalListenerAttached = false;
  }
}

// Singleton instance
export const sandpackMessageBus = new MessageBus();

// Hook helper for subscribing to instance messages
// Returns an unsubscribe function to be called in useEffect cleanup
export function useMessageBusSubscription(
  instanceId: string | null,
  handler: MessageHandler
): (() => void) | null {
  // Dynamic import to avoid issues during SSR
  if (typeof window === 'undefined') return null;

  if (!instanceId) return null;

  // Subscribe and return unsubscribe function for caller to use in cleanup
  return sandpackMessageBus.subscribe(instanceId, handler);
}
