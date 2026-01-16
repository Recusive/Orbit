/**
 * usePerception Hook
 *
 * Handles perception requests (ARIA snapshots, computed styles, element bounds)
 * for AI visual inspection of Sandpack previews.
 *
 * This is the AI's "eyes" - it enables the agent to:
 * - Inspect accessibility trees (ARIA)
 * - Query computed CSS styles
 * - Get element bounding rectangles
 * - Verify expected elements exist
 */
import { useCallback, useEffect, useRef } from 'react';

// Extend Window interface for dev console access
declare global {
  interface Window {
    __perception?: PerceptionTestHarness;
  }
}

// =============================================================================
// TYPES
// =============================================================================

export type PerceptionToolType =
  | 'get-aria-snapshot'
  | 'get-computed-styles'
  | 'get-element-bounds'
  | 'verify-component';

export interface PerceptionRequest {
  toolName: PerceptionToolType;
  nodeId: string;
  requestId: string;
  params: Record<string, unknown>;
  timestamp: number;
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
}

export interface AriaNode {
  role: string;
  name?: string;
  children?: AriaNode[];
  checked?: boolean | 'mixed';
  selected?: boolean;
  expanded?: boolean;
  disabled?: boolean;
  required?: boolean;
  level?: number;
}

export interface PerceptionResultPayload {
  // ARIA snapshot results
  ariaTree?: AriaNode;
  textRepresentation?: string;
  elementCount?: number;
  // Computed styles results
  styles?: Record<string, { raw: string }>;
  matchCount?: number;
  // Element bounds results
  elements?: {
    selector: string;
    bounds: { x: number; y: number; width: number; height: number };
  }[];
  viewport?: { width: number; height: number };
  // Verify component results
  rendered?: boolean;
  errors?: string[];
  ariaSummary?: string;
  foundElements?: string[];
  missingElements?: string[];
}

export interface UsePerceptionOptions {
  /** Timeout for perception requests in ms (default: 5000) */
  timeout?: number;
  /** Enable debug logging */
  debug?: boolean;
}

export interface UsePerceptionResult {
  /** Send a perception request and wait for response */
  sendPerceptionRequest: (
    nodeId: string,
    requestType: string,
    params: Record<string, unknown>
  ) => Promise<unknown>;
  /** Map of pending requests (for debugging) */
  pendingRequests: Map<string, PerceptionRequest>;
  /** Cancel all pending requests */
  cancelAllRequests: () => void;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_TIMEOUT = 5000;
const PERCEPTION_RESULT_TYPES = [
  'aria-snapshot-result',
  'computed-styles-result',
  'element-bounds-result',
  'verify-result',
] as const;

// =============================================================================
// HOOK
// =============================================================================

export function usePerception(options: UsePerceptionOptions = {}): UsePerceptionResult {
  const { timeout = DEFAULT_TIMEOUT, debug = false } = options;

  // Track pending perception requests for async responses
  const pendingRequests = useRef<Map<string, PerceptionRequest>>(new Map());

  // Debug logger
  const log = useCallback(
    (...args: unknown[]): void => {
      if (debug) {
        console.warn('[Perception]', ...args);
      }
    },
    [debug]
  );

  // Cancel all pending requests
  const cancelAllRequests = useCallback((): void => {
    for (const [requestId, request] of pendingRequests.current) {
      request.reject(new Error('Request cancelled'));
      log(`Cancelled request ${requestId}`);
    }
    pendingRequests.current.clear();
  }, [log]);

  // Listen for perception responses from Sandpack iframes
  useEffect(() => {
    const handlePerceptionMessage = (event: MessageEvent): void => {
      const msg = event.data as unknown;
      if (msg === null || msg === undefined || typeof msg !== 'object') return;

      const msgObj = msg as Record<string, unknown>;

      // Check for perception result message types
      const messageType = msgObj['type'];
      if (
        typeof messageType !== 'string' ||
        !PERCEPTION_RESULT_TYPES.includes(messageType as (typeof PERCEPTION_RESULT_TYPES)[number])
      ) {
        return;
      }

      const requestId = msgObj['requestId'];
      const nodeId = msgObj['nodeId'];
      const payload = msgObj['payload'] as PerceptionResultPayload | undefined;

      if (typeof requestId !== 'string') {
        log('Received perception result without requestId:', msgObj);
        return;
      }

      // Find pending request
      const pending = pendingRequests.current.get(requestId);
      if (!pending) {
        log(`Received result for unknown request ${requestId}`);
        return;
      }

      if (typeof nodeId === 'string' && pending.nodeId !== nodeId) {
        log(`Node ID mismatch: expected ${pending.nodeId}, got ${nodeId}`);
        return;
      }

      // Calculate response time
      const responseTime = Date.now() - pending.timestamp;
      log(`Received ${messageType} for ${pending.nodeId} in ${String(responseTime)}ms`);

      // Resolve the promise
      pending.resolve(payload ?? {});
      pendingRequests.current.delete(requestId);
    };

    window.addEventListener('message', handlePerceptionMessage);
    return (): void => {
      window.removeEventListener('message', handlePerceptionMessage);
    };
  }, [log]);

  // Send perception request to a Sandpack iframe
  const sendPerceptionRequest = useCallback(
    (nodeId: string, requestType: string, params: Record<string, unknown>): Promise<unknown> => {
      return new Promise((resolve, reject) => {
        const requestId = `perception-${String(Date.now())}-${Math.random().toString(36).slice(2, 9)}`;

        log(`Sending ${requestType} to ${nodeId} (${requestId})`);

        // Store pending request
        const request: PerceptionRequest = {
          toolName: requestType as PerceptionToolType,
          nodeId,
          requestId,
          params,
          timestamp: Date.now(),
          resolve,
          reject,
        };
        pendingRequests.current.set(requestId, request);

        // Find iframes - send to all (they filter by nodeId internally)
        const iframes = document.querySelectorAll('iframe');

        if (iframes.length === 0) {
          pendingRequests.current.delete(requestId);
          const error = new Error(`No iframe found for perception request to node ${nodeId}`);
          log(error.message);
          reject(error);
          return;
        }

        // Send to all iframes (they will filter by nodeId internally)
        let sentCount = 0;
        iframes.forEach((iframe) => {
          try {
            iframe.contentWindow?.postMessage(
              {
                type: requestType,
                nodeId,
                requestId,
                ...params,
              },
              '*'
            );
            sentCount++;
          } catch {
            // Ignore cross-origin errors - some iframes may be from different origins
          }
        });

        log(`Sent request to ${String(sentCount)}/${String(iframes.length)} iframes`);

        // Timeout handling with cleanup
        const timeoutId = setTimeout(() => {
          if (pendingRequests.current.has(requestId)) {
            pendingRequests.current.delete(requestId);
            const error = new Error(
              `Perception request timed out after ${String(timeout)}ms for node ${nodeId} (${requestType})`
            );
            log(error.message);
            reject(error);
          }
        }, timeout);

        // Store timeout ID for cleanup on resolve
        const originalResolve = request.resolve;
        request.resolve = (result): void => {
          clearTimeout(timeoutId);
          originalResolve(result);
        };
      });
    },
    [timeout, log]
  );

  return {
    sendPerceptionRequest,
    pendingRequests: pendingRequests.current,
    cancelAllRequests,
  };
}

// =============================================================================
// DEV TESTING UTILITIES
// =============================================================================

/**
 * Development testing harness for perception.
 * Exposes testing utilities on window for manual debugging.
 *
 * Usage in browser console:
 *   window.__perception.testAriaSnapshot('sandpack-123')
 *   window.__perception.testComputedStyles('sandpack-123', 'button')
 *   window.__perception.testElementBounds('sandpack-123', '.my-element')
 *   window.__perception.testVerify('sandpack-123', ['button', 'input'])
 */
export interface PerceptionTestHarness {
  testAriaSnapshot: (nodeId: string, includeHidden?: boolean) => Promise<unknown>;
  testComputedStyles: (
    nodeId: string,
    selector?: string,
    properties?: string[]
  ) => Promise<unknown>;
  testElementBounds: (
    nodeId: string,
    selector?: string,
    includeChildren?: boolean
  ) => Promise<unknown>;
  testVerify: (nodeId: string, expectedElements?: string[]) => Promise<unknown>;
  listPending: () => void;
}

/**
 * Install the perception test harness on window.
 * Call this from CanvasApp in development mode.
 */
export function installPerceptionTestHarness(
  sendPerceptionRequest: UsePerceptionResult['sendPerceptionRequest'],
  pendingRequests: UsePerceptionResult['pendingRequests']
): void {
  if (typeof window === 'undefined') return;

  const harness: PerceptionTestHarness = {
    testAriaSnapshot: async (nodeId, includeHidden = false) => {
      console.warn(`[Perception Test] ARIA snapshot for ${nodeId}`);
      const result = await sendPerceptionRequest(nodeId, 'get-aria-snapshot', { includeHidden });
      console.warn('[Perception Test] Result:', result);
      return result;
    },

    testComputedStyles: async (nodeId, selector, properties) => {
      console.warn(
        `[Perception Test] Computed styles for ${nodeId}${selector ? ` (${selector})` : ''}`
      );
      const result = await sendPerceptionRequest(nodeId, 'get-computed-styles', {
        selector,
        properties,
      });
      console.warn('[Perception Test] Result:', result);
      return result;
    },

    testElementBounds: async (nodeId, selector, includeChildren = false) => {
      console.warn(
        `[Perception Test] Element bounds for ${nodeId}${selector ? ` (${selector})` : ''}`
      );
      const result = await sendPerceptionRequest(nodeId, 'get-element-bounds', {
        selector,
        includeChildren,
      });
      console.warn('[Perception Test] Result:', result);
      return result;
    },

    testVerify: async (nodeId, expectedElements) => {
      console.warn(`[Perception Test] Verify ${nodeId}`, expectedElements);
      const result = await sendPerceptionRequest(nodeId, 'verify-component', { expectedElements });
      console.warn('[Perception Test] Result:', result);
      return result;
    },

    listPending: () => {
      console.warn('[Perception Test] Pending requests:');
      for (const [id, req] of pendingRequests) {
        const age = Date.now() - req.timestamp;
        console.warn(`  ${id}: ${req.toolName} -> ${req.nodeId} (${String(age)}ms ago)`);
      }
      if (pendingRequests.size === 0) {
        console.warn('  (none)');
      }
    },
  };

  // Expose on window for dev console access
  window.__perception = harness;
  console.warn(
    '[Perception] Test harness installed. Use window.__perception.testAriaSnapshot(nodeId) etc.'
  );
}
