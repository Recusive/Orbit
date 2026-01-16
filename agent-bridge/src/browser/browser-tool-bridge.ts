/**
 * Browser Tool Bridge - Promise-based bridge for MCP tool execution
 *
 * Bridges the synchronous MCP tool handlers with async webview communication.
 * When a tool is called:
 * 1. Create a unique request ID
 * 2. Send request via onToolRequest callback
 * 3. Wait for response (with timeout)
 * 4. Return result to caller
 */

import { EventEmitter } from 'node:events';

import { createLogger } from '../common/logging/logger.js';

import type { McpToolRequest, McpToolResponse } from './types.js';

const logger = createLogger('BrowserToolBridge');

/**
 * Pending tool request with resolver
 */
interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
  toolName: string;
}

/**
 * Callback type for tool request events
 */
export type ToolRequestCallback = (request: McpToolRequest) => void;

/**
 * Browser Tool Bridge
 *
 * This class bridges the synchronous MCP tool handlers with the async
 * webview/frontend communication.
 */
export class BrowserToolBridge {
  private static readonly TIMEOUT_MS = 30000; // 30 second timeout

  // Pending requests waiting for response
  private readonly pendingRequests = new Map<string, PendingRequest>();

  // Event emitter for tool requests
  private readonly emitter = new EventEmitter();

  // Whether the bridge has been disposed
  private disposed = false;

  constructor() {
    logger.info('Browser tool bridge initialized');
  }

  /**
   * Register a callback to receive tool requests.
   *
   * @param callback Function to handle outgoing tool requests
   * @returns Unsubscribe function
   */
  onToolRequest(callback: ToolRequestCallback): () => void {
    this.emitter.on('toolRequest', callback);
    return () => {
      this.emitter.off('toolRequest', callback);
    };
  }

  /**
   * Handle tool response from frontend/webview.
   * Resolves or rejects the corresponding pending request.
   *
   * @param response The tool response from the frontend
   */
  handleResponse(response: McpToolResponse): void {
    const pending = this.pendingRequests.get(response.requestId);
    if (!pending) {
      logger.warn({ requestId: response.requestId }, 'Received response for unknown request');
      return;
    }

    // Clear timeout and remove from pending
    clearTimeout(pending.timeout);
    this.pendingRequests.delete(response.requestId);

    if (response.success) {
      logger.debug(
        { requestId: response.requestId, toolName: pending.toolName },
        'Tool request succeeded'
      );
      pending.resolve(response.result);
    } else {
      logger.warn(
        { requestId: response.requestId, toolName: pending.toolName, error: response.error },
        'Tool request failed'
      );
      pending.reject(new Error(response.error ?? 'Unknown error'));
    }
  }

  /**
   * Send a tool request and wait for response.
   *
   * @param toolName Name of the tool to execute
   * @param toolInput Input arguments for the tool
   * @returns Promise that resolves with the tool result
   */
  async sendRequest<T = unknown>(toolName: string, toolInput: Record<string, unknown>): Promise<T> {
    if (this.disposed) {
      throw new Error('BrowserToolBridge has been disposed');
    }

    const requestId = `browser-${String(Date.now())}-${Math.random().toString(36).slice(2, 9)}`;

    return new Promise<T>((resolve, reject) => {
      // Set up timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        logger.warn(
          { requestId, toolName, timeoutMs: BrowserToolBridge.TIMEOUT_MS },
          'Tool request timed out'
        );
        reject(
          new Error(
            `Tool request '${toolName}' timed out after ${String(BrowserToolBridge.TIMEOUT_MS)}ms`
          )
        );
      }, BrowserToolBridge.TIMEOUT_MS);

      // Store pending request
      this.pendingRequests.set(requestId, {
        resolve: resolve as (result: unknown) => void,
        reject,
        timeout,
        toolName,
      });

      // Emit request to registered callbacks
      const request: McpToolRequest = {
        requestId,
        toolName,
        toolInput,
      };

      logger.debug({ requestId, toolName }, 'Sending tool request');
      this.emitter.emit('toolRequest', request);
    });
  }

  /**
   * Get the number of pending requests.
   */
  get pendingCount(): number {
    return this.pendingRequests.size;
  }

  /**
   * Check if the bridge has been disposed.
   */
  get isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Clean up pending requests and release resources.
   */
  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    // Reject all pending requests
    for (const [requestId, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Bridge disposed'));
      logger.debug(
        { requestId, toolName: pending.toolName },
        'Cancelled pending request on dispose'
      );
    }
    this.pendingRequests.clear();

    // Remove all event listeners
    this.emitter.removeAllListeners();

    logger.info('Browser tool bridge disposed');
  }
}

// Re-export types for convenience
export type { McpToolRequest, McpToolResponse } from './types.js';
