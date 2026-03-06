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
const DEFAULT_TIMEOUT_MS = 30000;
const ACTION_TIMEOUT_MS = 10000;
const SNAPSHOT_TIMEOUT_MS = 15000;
const MAX_WAIT_TIMEOUT_MS = 120000;
const STATEFUL_BROWSER_TOOLS = new Set([
  'browser_open',
  'browser_close',
  'browser_navigate',
  'browser_back',
  'browser_forward',
  'browser_reload',
  'browser_snapshot',
  'browser_click',
  'browser_type',
  'browser_fill',
  'browser_select',
  'browser_check',
  'browser_uncheck',
  'browser_hover',
  'browser_focus',
  'browser_scroll',
  'browser_scroll_into_view',
  'browser_wait_for_selector',
  'browser_wait_for_url',
]);

/**
 * Pending tool request with resolver
 */
interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
  toolName: string;
}

class AsyncQueue {
  private tail: Promise<void> = Promise.resolve();

  enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.tail.catch(() => undefined).then(task);
    this.tail = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }
}

function clampWaitTimeout(toolInput: Record<string, unknown>): number {
  const timeout = toolInput.timeout;
  if (typeof timeout !== 'number' || !Number.isFinite(timeout) || timeout <= 0) {
    return DEFAULT_TIMEOUT_MS;
  }
  return Math.min(Math.trunc(timeout), MAX_WAIT_TIMEOUT_MS);
}

export function getBrowserToolTimeoutMs(
  toolName: string,
  toolInput: Record<string, unknown>
): number {
  switch (toolName) {
    case 'browser_snapshot':
      return SNAPSHOT_TIMEOUT_MS;
    case 'browser_click':
    case 'browser_type':
    case 'browser_fill':
    case 'browser_select':
    case 'browser_check':
    case 'browser_uncheck':
    case 'browser_hover':
    case 'browser_focus':
    case 'browser_scroll':
    case 'browser_scroll_into_view':
      return ACTION_TIMEOUT_MS;
    case 'browser_wait_for_selector':
    case 'browser_wait_for_url':
      return clampWaitTimeout(toolInput);
    case 'browser_open':
    case 'browser_close':
    case 'browser_navigate':
    case 'browser_back':
    case 'browser_forward':
    case 'browser_reload':
      return DEFAULT_TIMEOUT_MS;
    default:
      return DEFAULT_TIMEOUT_MS;
  }
}

export function isStatefulBrowserTool(toolName: string): boolean {
  return STATEFUL_BROWSER_TOOLS.has(toolName);
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
  // Pending requests waiting for response
  private readonly pendingRequests = new Map<string, PendingRequest>();

  private readonly statefulQueue = new AsyncQueue();

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
    if (isStatefulBrowserTool(toolName)) {
      return this.statefulQueue.enqueue(() => this.sendRequestInternal<T>(toolName, toolInput));
    }

    return this.sendRequestInternal<T>(toolName, toolInput);
  }

  /**
   * [warning] TESTED: This bridge is covered by integration tests.
   *     If you modify this, run: cd agent-bridge && bun test
   *     Test files: src/__tests__/browser-ref-flow.test.ts, src/__tests__/browser-timeout.test.ts
   */
  private async sendRequestInternal<T>(
    toolName: string,
    toolInput: Record<string, unknown>
  ): Promise<T> {
    if (this.disposed) {
      throw new Error('BrowserToolBridge has been disposed');
    }

    const requestId = `browser-${String(Date.now())}-${Math.random().toString(36).slice(2, 11)}-${String(this.pendingRequests.size)}`;
    const timeoutMs = getBrowserToolTimeoutMs(toolName, toolInput);

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        logger.warn({ requestId, toolName, timeoutMs }, 'Tool request timed out');
        reject(new Error(`${toolName} timed out after ${String(timeoutMs)}ms`));
      }, timeoutMs);

      this.pendingRequests.set(requestId, {
        resolve: resolve as (result: unknown) => void,
        reject,
        timeout,
        toolName,
      });

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
