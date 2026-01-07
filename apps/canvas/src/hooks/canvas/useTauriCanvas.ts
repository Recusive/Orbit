/**
 * useTauriCanvas - Hook for Tauri-based canvas communication
 *
 * This hook replaces useOrbitMessaging for Tauri environments.
 * It provides the SAME callback interface for seamless migration.
 *
 * Communication flow:
 * - Uses Tauri listen() for receiving events (canvas:message, canvas:tool_request, canvas:error)
 * - Uses Tauri invoke() for sending commands (via canvasBackend functions)
 * - In non-Tauri environment (browser dev), logs messages but doesn't crash
 */

import { useCallback, useEffect, useState, useRef, useMemo } from 'react';

import {
  isTauriEnvironment,
  canvasCreateSession,
  canvasDeleteSession,
  canvasSendMessage,
  canvasToolResponse,
  canvasOrchestratorControl,
  onCanvasMessage,
  onCanvasToolRequest,
  onCanvasError,
} from '../backend/canvasBackend';

import type {
  OrchestratorState,
  OrchestratorError,
  OrchestratorControlAction,
  PerceptionResult,
  CanvasToolData,
} from '../../types/ipcProtocol';
import type { SDKMessage, CanvasState, McpToolRequest } from '../backend/canvasBackend';

// ═══════════════════════════════════════════════════════════════
// Types - Same interface as useOrbitMessaging
// ═══════════════════════════════════════════════════════════════

export interface TauriCanvasCallbacks {
  /** Agent text response (streaming or complete) */
  onAgentResponse?: (content: string, nodeId?: string, done?: boolean) => void;
  /** Agent thinking/reasoning content */
  onAgentThinking?: (content: string) => void;
  /** Agent tool use notification */
  onAgentToolUse?: (toolName: string, toolId: string, toolInput: unknown, status: string) => void;
  /** Agent error */
  onAgentError?: (error: string) => void;
  /** MCP tool request from agent */
  onMcpToolRequest?: (request: McpToolRequest) => void;
  /** Orchestrator state update */
  onOrchestratorState?: (state: OrchestratorState) => void;
  /** Orchestrator error */
  onOrchestratorError?: (error: OrchestratorError) => void;
  /** Code update from agent (e.g., error fixing) */
  onCodeUpdate?: (nodeId: string, code: string) => void;
  /** Export result callback */
  onExportResult?: (success: boolean, filePath?: string, error?: string) => void;
  /** Canvas tool execution from agent */
  onCanvasToolExecute?: (toolData: CanvasToolData) => void;
}

export interface UseTauriCanvasResult {
  /** Whether connected to Tauri backend */
  isConnected: boolean;

  /** Send a prompt to the agent (includes current canvas state) */
  sendPrompt: (prompt: string, nodeId?: string) => void;

  /** Update the stored canvas state (call before sendPrompt) */
  sendCanvasState: (
    nodes: unknown[],
    edges: unknown[],
    selectedNodeId?: string,
    selectedNodeType?: 'sandpack' | 'page'
  ) => void;

  /** Create a new session */
  createSession: (sessionId: string) => void;

  /** Delete a session */
  deleteSession: (sessionId: string) => void;

  /** Send MCP tool response back to agent */
  sendMcpToolResponse: (
    requestId: string,
    success: boolean,
    result?: unknown,
    error?: string
  ) => void;

  /** Send orchestrator control command (pause/resume/cancel) */
  sendOrchestratorControl: (action: OrchestratorControlAction, taskId?: string) => void;

  /** Send perception result back to agent */
  sendPerceptionResult: (
    requestId: string,
    toolName: string,
    nodeId: string,
    result: PerceptionResult
  ) => void;

  /** Export a component to a file */
  exportComponent: (nodeId: string, code: string, suggestedFilename: string) => void;

  /** Send Sandpack error to backend */
  sendError: (nodeId: string, error: string, stack?: string) => void;

  /** Request AI to fix an error */
  requestFix: (nodeId: string, code: string, error: string) => void;
}

// ═══════════════════════════════════════════════════════════════
// Tauri Listener Singleton (persists across HMR)
// ═══════════════════════════════════════════════════════════════

declare global {
  interface Window {
    __CANVAS_TAURI_LISTENERS_INITIALIZED__?: boolean;
    __CANVAS_TAURI_UNLISTENERS__?: (() => void)[];
    __CANVAS_MESSAGE_HANDLERS__?: Set<(sessionId: string, message: SDKMessage) => void>;
    __CANVAS_TOOL_REQUEST_HANDLERS__?: Set<(sessionId: string, request: McpToolRequest) => void>;
    __CANVAS_ERROR_HANDLERS__?: Set<(sessionId: string, error: string) => void>;
  }
}

// Initialize global handler registries
window.__CANVAS_MESSAGE_HANDLERS__ ??= new Set();
window.__CANVAS_TOOL_REQUEST_HANDLERS__ ??= new Set();
window.__CANVAS_ERROR_HANDLERS__ ??= new Set();

// Clean up on HMR
if (import.meta.hot !== undefined) {
  import.meta.hot.dispose(() => {
    if (window.__CANVAS_TAURI_UNLISTENERS__ !== undefined) {
      for (const unlisten of window.__CANVAS_TAURI_UNLISTENERS__) {
        unlisten();
      }
      window.__CANVAS_TAURI_UNLISTENERS__ = [];
      window.__CANVAS_TAURI_LISTENERS_INITIALIZED__ = false;
      console.warn('[useTauriCanvas] Listeners cleaned up for HMR');
    }
  });
}

/**
 * Initialize Tauri event listeners (singleton)
 */
async function initTauriListeners(): Promise<void> {
  if (window.__CANVAS_TAURI_LISTENERS_INITIALIZED__) return;
  if (!isTauriEnvironment()) {
    console.warn('[useTauriCanvas] Not in Tauri environment, skipping listener setup');
    return;
  }

  window.__CANVAS_TAURI_LISTENERS_INITIALIZED__ = true;
  window.__CANVAS_TAURI_UNLISTENERS__ = [];

  try {
    // Listen for canvas:message events
    const unlistenMessage = await onCanvasMessage((event) => {
      const handlers = window.__CANVAS_MESSAGE_HANDLERS__;
      if (handlers) {
        for (const handler of handlers) {
          handler(event.sessionId, event.message);
        }
      }
    });
    window.__CANVAS_TAURI_UNLISTENERS__.push(unlistenMessage);

    // Listen for canvas:tool_request events
    const unlistenToolRequest = await onCanvasToolRequest((event) => {
      const handlers = window.__CANVAS_TOOL_REQUEST_HANDLERS__;
      if (handlers) {
        for (const handler of handlers) {
          handler(event.sessionId, event.request);
        }
      }
    });
    window.__CANVAS_TAURI_UNLISTENERS__.push(unlistenToolRequest);

    // Listen for canvas:error events
    const unlistenError = await onCanvasError((event) => {
      const handlers = window.__CANVAS_ERROR_HANDLERS__;
      if (handlers) {
        for (const handler of handlers) {
          handler(event.sessionId, event.error);
        }
      }
    });
    window.__CANVAS_TAURI_UNLISTENERS__.push(unlistenError);

    console.warn('[useTauriCanvas] Tauri listeners initialized');
  } catch (err) {
    console.error('[useTauriCanvas] Failed to initialize listeners:', err);
    window.__CANVAS_TAURI_LISTENERS_INITIALIZED__ = false;
  }
}

// ═══════════════════════════════════════════════════════════════
// Hook Implementation
// ═══════════════════════════════════════════════════════════════

/**
 * Hook for Tauri-based canvas communication
 *
 * Provides the same interface as useOrbitMessaging for seamless migration.
 */
export function useTauriCanvas(callbacks?: TauriCanvasCallbacks): UseTauriCanvasResult {
  const [isConnected, setIsConnected] = useState(false);
  const callbacksRef = useRef(callbacks);

  // Individual refs for new callbacks (for use in async contexts)
  const onCodeUpdateRef = useRef(callbacks?.onCodeUpdate);
  const onExportResultRef = useRef(callbacks?.onExportResult);
  const onCanvasToolExecuteRef = useRef(callbacks?.onCanvasToolExecute);

  // Store canvas state for sendPrompt
  const canvasStateRef = useRef<CanvasState>({
    nodes: [],
    edges: [],
  });

  // Current session ID (can be managed by the consuming component)
  const sessionIdRef = useRef<string | null>(null);

  // Track created sessions
  const createdSessionsRef = useRef(new Set<string>());

  // Keep callbacks ref updated
  useEffect(() => {
    callbacksRef.current = callbacks;
    onCodeUpdateRef.current = callbacks?.onCodeUpdate;
    onExportResultRef.current = callbacks?.onExportResult;
    onCanvasToolExecuteRef.current = callbacks?.onCanvasToolExecute;
  }, [callbacks]);

  // Initialize Tauri connection
  useEffect(() => {
    const isTauri = isTauriEnvironment();
    setIsConnected(isTauri);

    if (isTauri) {
      // Initialize singleton listeners
      void initTauriListeners();
    } else {
      console.warn('[useTauriCanvas] Running in browser mode (no Tauri)');
    }
  }, []);

  // Message handler - maps SDKMessage types to callbacks
  const handleMessage = useCallback((sessionId: string, message: SDKMessage): void => {
    const cbs = callbacksRef.current;
    if (!cbs) return;

    // Only process messages for our session
    if (sessionIdRef.current !== null && sessionId !== sessionIdRef.current) {
      return;
    }

    const nodeId = message.metadata?.nodeId;

    switch (message.type) {
      case 'text':
        cbs.onAgentResponse?.(message.content, nodeId, message.done ?? false);
        break;

      case 'thinking':
        cbs.onAgentThinking?.(message.content);
        break;

      case 'tool_use':
        if (message.metadata) {
          cbs.onAgentToolUse?.(
            message.metadata.toolName ?? 'unknown',
            message.metadata.toolId ?? '',
            message.metadata.toolInput,
            message.metadata.status ?? 'running'
          );

          // Check if this is a code update tool
          const metadata = message.metadata as {
            toolName?: string;
            toolInput?: Record<string, unknown>;
            status?: string;
          };

          // Call onCodeUpdate for update_component tool with success status
          if (
            metadata.toolName === 'update_component' &&
            metadata.status === 'success' &&
            metadata.toolInput
          ) {
            const toolNodeId = metadata.toolInput['nodeId'] as string | undefined;
            const code = metadata.toolInput['code'] as string | undefined;
            if (toolNodeId && code) {
              onCodeUpdateRef.current?.(toolNodeId, code);
            }
          }
        }
        break;

      case 'error':
        cbs.onAgentError?.(message.content);
        break;

      case 'result':
        // Result is treated as a complete response
        cbs.onAgentResponse?.(message.content, nodeId, true);
        break;
    }
  }, []);

  // Tool request handler
  const handleToolRequest = useCallback((_sessionId: string, request: McpToolRequest): void => {
    const cbs = callbacksRef.current;
    cbs?.onMcpToolRequest?.(request);
  }, []);

  // Error handler
  const handleError = useCallback((_sessionId: string, error: string): void => {
    const cbs = callbacksRef.current;
    cbs?.onAgentError?.(error);
  }, []);

  // Register/unregister handlers
  useEffect(() => {
    const messageHandlers = window.__CANVAS_MESSAGE_HANDLERS__;
    const toolRequestHandlers = window.__CANVAS_TOOL_REQUEST_HANDLERS__;
    const errorHandlers = window.__CANVAS_ERROR_HANDLERS__;

    messageHandlers?.add(handleMessage);
    toolRequestHandlers?.add(handleToolRequest);
    errorHandlers?.add(handleError);

    return (): void => {
      messageHandlers?.delete(handleMessage);
      toolRequestHandlers?.delete(handleToolRequest);
      errorHandlers?.delete(handleError);
    };
  }, [handleMessage, handleToolRequest, handleError]);

  // ═══════════════════════════════════════════════════════════════
  // Public API Methods
  // ═══════════════════════════════════════════════════════════════

  /** Update stored canvas state */
  const sendCanvasState = useCallback(
    (
      nodes: unknown[],
      edges: unknown[],
      selectedNodeId?: string,
      selectedNodeType?: 'sandpack' | 'page'
    ): void => {
      canvasStateRef.current = {
        nodes,
        edges,
        selectedNodeId,
        selectedNodeType,
      };
    },
    []
  );

  /** Create session */
  const createSession = useCallback((sessionId: string): void => {
    if (!isTauriEnvironment()) {
      console.warn('[useTauriCanvas] createSession (mock):', sessionId);
      return;
    }

    if (createdSessionsRef.current.has(sessionId)) {
      return;
    }

    sessionIdRef.current = sessionId;
    createdSessionsRef.current.add(sessionId);

    canvasCreateSession(sessionId).catch((err: unknown) => {
      console.error('[useTauriCanvas] Failed to create session:', err);
      createdSessionsRef.current.delete(sessionId);
    });
  }, []);

  /** Delete session */
  const deleteSession = useCallback((sessionId: string): void => {
    if (!isTauriEnvironment()) {
      console.warn('[useTauriCanvas] deleteSession (mock):', sessionId);
      return;
    }

    createdSessionsRef.current.delete(sessionId);
    if (sessionIdRef.current === sessionId) {
      sessionIdRef.current = null;
    }

    canvasDeleteSession(sessionId).catch((err: unknown) => {
      console.error('[useTauriCanvas] Failed to delete session:', err);
    });
  }, []);

  /** Send prompt with current canvas state */
  const sendPrompt = useCallback((prompt: string, nodeId?: string): void => {
    const sessionId = sessionIdRef.current;

    if (!isTauriEnvironment()) {
      console.warn('[useTauriCanvas] sendPrompt (mock):', { prompt, nodeId, sessionId });
      return;
    }

    if (!sessionId) {
      console.error('[useTauriCanvas] No session ID set. Call createSession first.');
      return;
    }

    // Note: nodeId is available for future use but not currently passed to backend
    void nodeId; // Suppress unused variable warning
    canvasSendMessage(sessionId, prompt, canvasStateRef.current).catch((err: unknown) => {
      console.error('[useTauriCanvas] Failed to send message:', err);
      callbacksRef.current?.onAgentError?.(`Failed to send message: ${String(err)}`);
    });
  }, []);

  /** Send MCP tool response */
  const sendMcpToolResponse = useCallback(
    (requestId: string, success: boolean, result?: unknown, error?: string): void => {
      const sessionId = sessionIdRef.current;

      if (!isTauriEnvironment()) {
        console.warn('[useTauriCanvas] sendMcpToolResponse (mock):', {
          requestId,
          success,
          result,
          error,
        });
        return;
      }

      if (!sessionId) {
        console.error('[useTauriCanvas] No session ID set');
        return;
      }

      canvasToolResponse(sessionId, requestId, success, result, error).catch((err: unknown) => {
        console.error('[useTauriCanvas] Failed to send tool response:', err);
      });
    },
    []
  );

  /** Send orchestrator control command */
  const sendOrchestratorControl = useCallback(
    (action: OrchestratorControlAction, taskId?: string): void => {
      const sessionId = sessionIdRef.current;

      if (!isTauriEnvironment()) {
        console.warn('[useTauriCanvas] sendOrchestratorControl (mock):', { action, taskId });
        return;
      }

      if (!sessionId) {
        console.error('[useTauriCanvas] No session ID set');
        return;
      }

      canvasOrchestratorControl(sessionId, action, taskId).catch((err: unknown) => {
        console.error('[useTauriCanvas] Failed to send orchestrator control:', err);
      });
    },
    []
  );

  /** Send perception result back to agent */
  const sendPerceptionResult = useCallback(
    (requestId: string, toolName: string, nodeId: string, result: PerceptionResult): void => {
      const sessionId = sessionIdRef.current;

      if (!isTauriEnvironment()) {
        console.warn('[useTauriCanvas] sendPerceptionResult (mock):', {
          requestId,
          toolName,
          nodeId,
          result,
        });
        return;
      }

      if (!sessionId) {
        console.error('[useTauriCanvas] No session ID set');
        return;
      }

      // In Tauri, perception results go through canvasToolResponse
      // The result is wrapped as an MCP tool response
      canvasToolResponse(sessionId, requestId, true, { toolName, nodeId, ...result }).catch(
        (err: unknown) => {
          console.error('[useTauriCanvas] Failed to send perception result:', err);
        }
      );
    },
    []
  );

  /** Export a component to a file */
  const exportComponent = useCallback(
    (nodeId: string, code: string, suggestedFilename: string): void => {
      if (!isTauriEnvironment()) {
        console.warn('[useTauriCanvas] exportComponent (mock):', { nodeId, suggestedFilename });
        return;
      }

      void (async (): Promise<void> => {
        try {
          // Dynamic import to handle browser mode gracefully
          const { save } = await import('@tauri-apps/plugin-dialog');
          const { writeTextFile } = await import('@tauri-apps/plugin-fs');

          // Open save dialog with suggested filename
          const filePath = await save({
            defaultPath: suggestedFilename,
            filters: [
              {
                name: 'TypeScript/JavaScript',
                extensions: ['tsx', 'jsx', 'ts', 'js'],
              },
            ],
          });

          if (filePath) {
            // Write the code to the selected file
            await writeTextFile(filePath, code);
            console.warn('[useTauriCanvas] Component exported:', filePath);
            onExportResultRef.current?.(true, filePath, undefined);
          }
        } catch (err: unknown) {
          console.error('[useTauriCanvas] Failed to export component:', err);
          onExportResultRef.current?.(
            false,
            undefined,
            err instanceof Error ? err.message : 'Export failed'
          );
        }
      })();
    },
    []
  );

  /** Send Sandpack error to backend */
  const sendError = useCallback((nodeId: string, error: string, stack?: string): void => {
    // In Tauri, we could send this to the backend for logging/error tracking
    // For now, just log locally - the agent can see errors through other means
    console.warn('[useTauriCanvas] Sandpack error:', { nodeId, error, stack });
    // TODO: Implement Tauri command to report errors if needed
  }, []);

  /** Request AI to fix an error */
  const requestFix = useCallback((nodeId: string, code: string, error: string): void => {
    const sessionId = sessionIdRef.current;

    if (!isTauriEnvironment()) {
      console.warn('[useTauriCanvas] requestFix (mock):', { nodeId, error });
      return;
    }

    if (!sessionId) {
      console.error('[useTauriCanvas] No session ID set for requestFix');
      return;
    }

    // Send a prompt to the agent asking it to fix the error
    const fixPrompt = `Fix the following error in the component:\n\nError: ${error}\n\nCurrent code:\n\`\`\`tsx\n${code}\n\`\`\``;
    // Note: nodeId is included in the fixPrompt context for the agent
    void nodeId; // Suppress unused variable warning
    canvasSendMessage(sessionId, fixPrompt, canvasStateRef.current).catch((err: unknown) => {
      console.error('[useTauriCanvas] Failed to send fix request:', err);
    });
  }, []);

  // Memoize return object to prevent unnecessary re-renders
  return useMemo(
    () => ({
      isConnected,
      sendPrompt,
      sendCanvasState,
      createSession,
      deleteSession,
      sendMcpToolResponse,
      sendOrchestratorControl,
      sendPerceptionResult,
      exportComponent,
      sendError,
      requestFix,
    }),
    [
      isConnected,
      sendPrompt,
      sendCanvasState,
      createSession,
      deleteSession,
      sendMcpToolResponse,
      sendOrchestratorControl,
      sendPerceptionResult,
      exportComponent,
      sendError,
      requestFix,
    ]
  );
}

// Re-export types for convenience
export type { SDKMessage, McpToolRequest, CanvasState } from '../backend/canvasBackend';
