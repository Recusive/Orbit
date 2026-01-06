/**
 * Claude Agent SDK wrapper for dev-monitor.
 *
 * Since the SDK runs in the agent-bridge sidecar (Node.js process),
 * this wrapper monitors SDK interactions from the frontend by:
 * - Tracking message send/receive patterns
 * - Measuring response latency
 * - Counting token usage (when available)
 * - Monitoring tool calls and their durations
 *
 * The wrapper uses a Proxy pattern to intercept SDK client method calls.
 * Follows the error isolation pattern - monitoring errors never crash the SDK.
 */

import { captureEvent } from '../core/storage';

import type { Severity } from '../core/types';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

/** Options for SDK wrapper */
export interface SDKWrapperOptions {
  /** Methods to monitor (default: all async methods) */
  methods?: string[];
  /** Whether to capture input/output payloads (default: false for privacy) */
  capturePayloads?: boolean;
  /** Latency threshold for slow call warnings (ms, default: 5000) */
  slowThreshold?: number;
}

/** Options for individual SDK call monitoring */
export interface SDKCallOptions {
  /** Category for this call (default: 'sdk:call') */
  category?: string;
  /** Additional context to include */
  context?: Record<string, unknown>;
}

/** Internal state for tracking SDK sessions */
interface SDKSessionState {
  sessionId: string;
  startTime: number;
  messageCount: number;
  toolCallCount: number;
  tokenCount: number;
  lastMessageTime: number;
}

// ═══════════════════════════════════════════════════════════════
// Session Tracking
// ═══════════════════════════════════════════════════════════════

/** Active SDK sessions being monitored */
const activeSessions = new Map<string, SDKSessionState>();

/**
 * Start monitoring an SDK session.
 */
export function startSession(sessionId: string): void {
  try {
    const state: SDKSessionState = {
      sessionId,
      startTime: performance.now(),
      messageCount: 0,
      toolCallCount: 0,
      tokenCount: 0,
      lastMessageTime: performance.now(),
    };

    activeSessions.set(sessionId, state);

    captureEvent({
      severity: 'info',
      category: 'sdk:session:start',
      file: 'sdk',
      function: 'startSession',
      title: `SDK session started: ${sessionId.slice(0, 8)}...`,
      context: {
        sessionId,
      },
    });
  } catch (err: unknown) {
    console.error('[DevMonitor] SDK session start capture failed:', err);
  }
}

/**
 * End monitoring an SDK session.
 */
export function endSession(sessionId: string): void {
  try {
    const state = activeSessions.get(sessionId);
    if (!state) return;

    const duration = performance.now() - state.startTime;

    captureEvent({
      severity: 'info',
      category: 'sdk:session:end',
      file: 'sdk',
      function: 'endSession',
      title: `SDK session ended: ${sessionId.slice(0, 8)}...`,
      context: {
        sessionId,
        duration_ms: duration,
        messageCount: state.messageCount,
        toolCallCount: state.toolCallCount,
        tokenCount: state.tokenCount,
      },
    });

    activeSessions.delete(sessionId);
  } catch (err: unknown) {
    console.error('[DevMonitor] SDK session end capture failed:', err);
  }
}

/**
 * Track a message sent to the SDK.
 */
export function trackMessageSent(
  sessionId: string,
  messageType: 'user' | 'system',
  contentLength: number
): void {
  try {
    const state = activeSessions.get(sessionId);
    if (state) {
      state.messageCount += 1;
      state.lastMessageTime = performance.now();
    }

    captureEvent({
      severity: 'info',
      category: 'sdk:message:sent',
      file: 'sdk',
      function: 'sendMessage',
      title: `Message sent (${messageType})`,
      context: {
        sessionId,
        messageType,
        contentLength,
      },
    });
  } catch (err: unknown) {
    console.error('[DevMonitor] SDK message sent capture failed:', err);
  }
}

/**
 * Track a message received from the SDK.
 */
export function trackMessageReceived(
  sessionId: string,
  messageType: 'text' | 'thinking' | 'tool_use' | 'result' | 'error',
  metadata?: {
    tokens?: number;
    toolName?: string;
    isPartial?: boolean;
  }
): void {
  try {
    const state = activeSessions.get(sessionId);
    if (state !== undefined) {
      if (metadata?.tokens !== undefined) {
        state.tokenCount += metadata.tokens;
      }
      if (messageType === 'tool_use') {
        state.toolCallCount += 1;
      }
    }

    // Calculate latency since last message
    const latency = state ? performance.now() - state.lastMessageTime : 0;

    const severity: Severity = messageType === 'error' ? 'error' : 'info';

    captureEvent({
      severity,
      category: `sdk:message:${messageType}`,
      file: 'sdk',
      function: 'receiveMessage',
      title: `Message received (${messageType})${metadata?.toolName ? `: ${metadata.toolName}` : ''}`,
      context: {
        sessionId,
        messageType,
        latency_ms: latency,
        ...metadata,
      },
    });

    // Update last message time
    if (state) {
      state.lastMessageTime = performance.now();
    }
  } catch (err: unknown) {
    console.error('[DevMonitor] SDK message received capture failed:', err);
  }
}

/**
 * Track a tool call start.
 */
export function trackToolStart(
  sessionId: string,
  toolName: string,
  toolInput?: Record<string, unknown>
): void {
  try {
    captureEvent({
      severity: 'info',
      category: 'sdk:tool:start',
      file: 'sdk',
      function: toolName,
      title: `Tool started: ${toolName}`,
      context: {
        sessionId,
        toolName,
        hasInput: toolInput !== undefined,
      },
    });
  } catch (err: unknown) {
    console.error('[DevMonitor] SDK tool start capture failed:', err);
  }
}

/**
 * Track a tool call end.
 */
export function trackToolEnd(
  sessionId: string,
  toolName: string,
  success: boolean,
  durationMs?: number
): void {
  try {
    const severity: Severity = success ? 'info' : 'error';

    captureEvent({
      severity,
      category: success ? 'sdk:tool:end' : 'sdk:tool:error',
      file: 'sdk',
      function: toolName,
      title: `Tool ${success ? 'completed' : 'failed'}: ${toolName}`,
      context: {
        sessionId,
        toolName,
        success,
        duration_ms: durationMs,
      },
    });
  } catch (err: unknown) {
    console.error('[DevMonitor] SDK tool end capture failed:', err);
  }
}

// ═══════════════════════════════════════════════════════════════
// SDK Client Wrapper
// ═══════════════════════════════════════════════════════════════

/**
 * Wrap an SDK client to add monitoring to all async methods.
 *
 * Uses Proxy to intercept method calls without modifying the original client.
 * This is designed to work with any SDK-like object that has async methods.
 *
 * @example
 * const wrappedClient = sdkWrapper('MainClient', anthropicClient);
 */
export function sdkWrapper<T extends object>(
  name: string,
  client: T,
  options: SDKWrapperOptions = {}
): T {
  const { methods, slowThreshold = 5000 } = options;

  // Log initialization
  try {
    captureEvent({
      severity: 'info',
      category: 'sdk:init',
      file: `sdk:${name}`,
      function: 'create',
      title: `${name} SDK client wrapped`,
      context: {
        monitoredMethods: methods ?? 'all async',
      },
    });
  } catch (err: unknown) {
    console.error('[DevMonitor] SDK init capture failed:', err);
  }

  return new Proxy(client, {
    get(target: T, prop: string | symbol): unknown {
      const value = target[prop as keyof T];

      // Only wrap functions
      if (typeof value !== 'function') {
        return value;
      }

      const methodName = String(prop);

      // Check if we should monitor this method
      if (methods && !methods.includes(methodName)) {
        return value.bind(target);
      }

      // Return wrapped function
      return async function (this: unknown, ...args: unknown[]): Promise<unknown> {
        const start = performance.now();

        try {
          captureEvent({
            severity: 'info',
            category: 'sdk:call:start',
            file: `sdk:${name}`,
            function: methodName,
            title: `${name}.${methodName}() called`,
            context: {
              argCount: args.length,
            },
          });
        } catch (err: unknown) {
          console.error('[DevMonitor] SDK call start capture failed:', err);
        }

        try {
          const result = await (value as (...a: unknown[]) => Promise<unknown>).apply(target, args);
          const duration = performance.now() - start;

          try {
            const severity: Severity = duration > slowThreshold ? 'perf' : 'info';

            captureEvent({
              severity,
              category: duration > slowThreshold ? 'sdk:call:slow' : 'sdk:call:end',
              file: `sdk:${name}`,
              function: methodName,
              title: `${name}.${methodName}() completed (${duration.toFixed(1)}ms)`,
              context: {
                duration_ms: duration,
                slow: duration > slowThreshold,
              },
            });
          } catch (err: unknown) {
            console.error('[DevMonitor] SDK call end capture failed:', err);
          }

          return result;
        } catch (error: unknown) {
          const duration = performance.now() - start;

          try {
            captureEvent({
              severity: 'error',
              category: 'sdk:call:error',
              file: `sdk:${name}`,
              function: methodName,
              title: `${name}.${methodName}() failed`,
              details: error instanceof Error ? error.message : String(error),
              context: {
                duration_ms: duration,
              },
            });
          } catch (err: unknown) {
            console.error('[DevMonitor] SDK call error capture failed:', err);
          }

          throw error;
        }
      };
    },
  });
}

// ═══════════════════════════════════════════════════════════════
// SDK Call Wrapper
// ═══════════════════════════════════════════════════════════════

/**
 * Wrap an individual SDK call with monitoring.
 *
 * Use this for one-off calls that don't need a full client wrapper.
 *
 * @example
 * const response = await sdkCallWrapper('generateText', async () => {
 *   return await client.messages.create({ ... });
 * });
 */
export async function sdkCallWrapper<T>(
  name: string,
  fn: () => Promise<T>,
  options: SDKCallOptions = {}
): Promise<T> {
  const { category = 'sdk:call', context = {} } = options;
  const start = performance.now();

  try {
    captureEvent({
      severity: 'info',
      category: `${category}:start`,
      file: 'sdk',
      function: name,
      title: `${name} started`,
      context,
    });
  } catch (err: unknown) {
    console.error('[DevMonitor] SDK call wrapper start capture failed:', err);
  }

  try {
    const result = await fn();
    const duration = performance.now() - start;

    try {
      captureEvent({
        severity: duration > 5000 ? 'perf' : 'info',
        category: `${category}:end`,
        file: 'sdk',
        function: name,
        title: `${name} completed (${duration.toFixed(1)}ms)`,
        context: {
          ...context,
          duration_ms: duration,
        },
      });
    } catch (err: unknown) {
      console.error('[DevMonitor] SDK call wrapper end capture failed:', err);
    }

    return result;
  } catch (error: unknown) {
    const duration = performance.now() - start;

    try {
      captureEvent({
        severity: 'error',
        category: `${category}:error`,
        file: 'sdk',
        function: name,
        title: `${name} failed`,
        details: error instanceof Error ? error.message : String(error),
        context: {
          ...context,
          duration_ms: duration,
        },
      });
    } catch (err: unknown) {
      console.error('[DevMonitor] SDK call wrapper error capture failed:', err);
    }

    throw error;
  }
}
