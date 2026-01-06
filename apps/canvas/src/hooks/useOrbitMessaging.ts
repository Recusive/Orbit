/**
 * useOrbitMessaging - Hook for communication between Canvas webview and Orbit extension
 *
 * This hook provides a React-friendly interface for:
 * - Sending messages to the VS Code extension host
 * - Receiving messages from the extension (agent responses, code updates, errors)
 * - Managing the connection state
 */

import { useCallback, useEffect, useState, useRef, useMemo } from 'react';

import { parseExtensionMessage } from '../types/ipcProtocol';

import type {
  CanvasToExtensionMessage,
  CanvasToolData,
  McpToolRequest,
  PerceptionResult,
  OrchestratorState,
  OrchestratorError,
  Conflict,
  Resolution,
  OrchestratorControlAction,
} from '../types/ipcProtocol';

// Re-export types for backwards compatibility
export type {
  AriaNode,
  AriaSnapshotResult,
  ComputedStyleValue,
  ComputedStylesResult,
  ElementBounds,
  ElementBoundsResult,
  VerifyResult,
  PerceptionResult,
  CreateComponentData,
  UpdateComponentData,
  DeleteComponentData,
  ConnectComponentsData,
  MoveComponentData,
  GetAriaSnapshotData,
  GetComputedStylesData,
  GetElementBoundsData,
  VerifyComponentData,
  CreatePageData,
  AddToPageData,
  RemoveFromPageData,
  ReorderLayersData,
  UpdateLayoutData,
  UpdatePageSlotData,
  CanvasToolData,
  McpToolRequest,
  CanvasToExtensionMessage,
  ExtensionToCanvasMessage,
  OrbitMessage,
  OrchestratorState,
  OrchestratorError,
  Conflict,
  Resolution,
  OrchestratorControlAction,
} from '../types/ipcProtocol';

// Callback types for message handlers
export interface OrbitMessagingCallbacks {
  onAgentResponse?: (content: string, nodeId?: string, done?: boolean) => void;
  onAgentThinking?: (content: string) => void;
  onAgentToolUse?: (toolName: string, toolId: string, toolInput: unknown, status: string) => void;
  onCodeUpdate?: (nodeId: string, code: string) => void;
  onAgentError?: (error: string) => void;
  onSessionState?: (sessionId: string, status: string) => void;
  onThemeUpdate?: (theme: {
    type: string;
    colors: { background?: string; foreground?: string };
  }) => void;
  onCanvasToolExecute?: (toolData: CanvasToolData) => void;
  onExportResult?: (success: boolean, filePath?: string, error?: string) => void;
  /** Handler for MCP tool requests (new architecture) */
  onMcpToolRequest?: (request: McpToolRequest) => void;
  /** Handler for orchestrator state updates */
  onOrchestratorState?: (state: OrchestratorState) => void;
  /** Handler for orchestrator errors */
  onOrchestratorError?: (error: OrchestratorError) => void;
  /** Handler for conflict detection requiring user resolution */
  onConflictDetected?: (
    conflict: Conflict,
    requiresUserInput: boolean,
    options?: Resolution[]
  ) => void;
  /** Handler for full state restore (undo/redo, session restore) */
  onStateUpdate?: (nodes: unknown[], edges: unknown[], selectedNodeId?: string) => void;
}

export interface UseOrbitMessagingResult {
  // Connection state
  isConnected: boolean;

  // Send messages to extension
  sendError: (nodeId: string, error: string, stack?: string) => void;
  requestFix: (nodeId: string, code: string, error: string) => void;
  sendPrompt: (prompt: string, nodeId?: string) => void;
  sendCanvasState: (
    nodes: unknown[],
    edges: unknown[],
    selectedNodeId?: string,
    selectedNodeType?: 'sandpack' | 'page'
  ) => void;
  createSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;
  exportComponent: (nodeId: string, code: string, suggestedFilename: string) => void;
  sendPerceptionResult: (
    requestId: string,
    toolName: string,
    nodeId: string,
    result: PerceptionResult
  ) => void;
  /** Send MCP tool response back to extension */
  sendMcpToolResponse: (
    requestId: string,
    success: boolean,
    result?: unknown,
    error?: string
  ) => void;

  // Orchestrator controls
  /** Send conflict resolution choice to extension */
  sendConflictResolution: (conflictId: string, resolution: Resolution) => void;
  /** Send orchestrator control command (pause/resume/cancel) */
  sendOrchestratorControl: (action: OrchestratorControlAction, taskId?: string) => void;

  // Raw postMessage (for custom messages)
  postMessage: (message: CanvasToExtensionMessage) => void;
}

/**
 * Hook for bidirectional communication with VS Code extension
 */
export function useOrbitMessaging(callbacks?: OrbitMessagingCallbacks): UseOrbitMessagingResult {
  const [isConnected, setIsConnected] = useState(false);
  const callbacksRef = useRef(callbacks);

  // Keep callbacks ref updated
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  // Check if vscode API is available
  useEffect(() => {
    if (window.vscode) {
      setIsConnected(true);
    }
  }, []);

  // Listen for messages from extension
  useEffect(() => {
    const handleMessage = (event: MessageEvent): void => {
      // Use typesafe message parser with validation
      const message = parseExtensionMessage(event);
      if (message === null) return;

      const cbs = callbacksRef.current;
      if (!cbs) return;

      switch (message.type) {
        case 'agent-response':
          cbs.onAgentResponse?.(message.content, message.nodeId, message.done);
          break;

        case 'agent-thinking':
          cbs.onAgentThinking?.(message.content);
          break;

        case 'agent-tool-use':
          cbs.onAgentToolUse?.(message.toolName, message.toolId, message.toolInput, message.status);
          break;

        case 'code-update':
          cbs.onCodeUpdate?.(message.nodeId, message.code);
          break;

        case 'agent-error':
          cbs.onAgentError?.(message.error);
          break;

        case 'session-state':
          cbs.onSessionState?.(message.sessionId, message.status);
          break;

        case 'theme-update':
          cbs.onThemeUpdate?.(message.payload);
          break;

        case 'canvas-tool-execute':
          cbs.onCanvasToolExecute?.(message.payload);
          break;

        case 'export-result':
          cbs.onExportResult?.(message.success, message.filePath, message.error);
          break;

        case 'mcp-tool-request':
          cbs.onMcpToolRequest?.(message.payload);
          break;

        case 'orchestrator-state':
          cbs.onOrchestratorState?.(message.payload);
          break;

        case 'orchestrator-error':
          cbs.onOrchestratorError?.(message.payload);
          break;

        case 'conflict-detected':
          cbs.onConflictDetected?.(
            message.payload.conflict,
            message.payload.requiresUserInput,
            message.payload.options
          );
          break;

        case 'state-update':
          cbs.onStateUpdate?.(
            message.payload.nodes,
            message.payload.edges,
            message.payload.selectedNodeId
          );
          break;

        case 'layout':
          // Layout messages are handled by the canvas resize system
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  // Send message to extension
  const postMessage = useCallback((message: CanvasToExtensionMessage): void => {
    if (window.vscode) {
      window.vscode.postMessage(message);
    }
  }, []);

  // Helper: Send Sandpack error to extension
  const sendError = useCallback(
    (nodeId: string, error: string, stack?: string): void => {
      postMessage({
        type: 'sandpack-error',
        nodeId,
        error,
        ...(stack !== undefined ? { stack } : {}),
      });
    },
    [postMessage]
  );

  // Helper: Request error fix from AI
  const requestFix = useCallback(
    (nodeId: string, code: string, error: string): void => {
      postMessage({
        type: 'request-fix',
        nodeId,
        code,
        error,
      });
    },
    [postMessage]
  );

  // Helper: Send prompt to AI
  const sendPrompt = useCallback(
    (prompt: string, nodeId?: string): void => {
      postMessage({
        type: 'send-prompt',
        prompt,
        ...(nodeId !== undefined ? { nodeId } : {}),
      });
    },
    [postMessage]
  );

  // Helper: Send canvas state with selection info
  const sendCanvasState = useCallback(
    (
      nodes: unknown[],
      edges: unknown[],
      selectedNodeId?: string,
      selectedNodeType?: 'sandpack' | 'page'
    ): void => {
      postMessage({
        type: 'canvas-state',
        nodes,
        edges,
        ...(selectedNodeId !== undefined ? { selectedNodeId } : {}),
        ...(selectedNodeType !== undefined ? { selectedNodeType } : {}),
      });
    },
    [postMessage]
  );

  // Helper: Create session
  const createSession = useCallback(
    (sessionId: string): void => {
      postMessage({
        type: 'create-session',
        sessionId,
      });
    },
    [postMessage]
  );

  // Helper: Delete session
  const deleteSession = useCallback(
    (sessionId: string): void => {
      postMessage({
        type: 'delete-session',
        sessionId,
      });
    },
    [postMessage]
  );

  // Helper: Export component code to file
  const exportComponent = useCallback(
    (nodeId: string, code: string, suggestedFilename: string): void => {
      postMessage({
        type: 'export-component',
        nodeId,
        code,
        suggestedFilename,
      });
    },
    [postMessage]
  );

  // Helper: Send perception result back to extension
  const sendPerceptionResult = useCallback(
    (requestId: string, toolName: string, nodeId: string, result: PerceptionResult): void => {
      postMessage({
        type: 'perception-result',
        requestId,
        toolName,
        nodeId,
        result,
      });
    },
    [postMessage]
  );

  // Helper: Send MCP tool response back to extension
  const sendMcpToolResponse = useCallback(
    (requestId: string, success: boolean, result?: unknown, error?: string): void => {
      const message: {
        type: 'mcp-tool-response';
        requestId: string;
        success: boolean;
        result?: unknown;
        error?: string;
      } = {
        type: 'mcp-tool-response',
        requestId,
        success,
      };
      if (result !== undefined) message.result = result;
      if (error !== undefined) message.error = error;
      postMessage(message);
    },
    [postMessage]
  );

  // Helper: Send conflict resolution choice to extension
  const sendConflictResolution = useCallback(
    (conflictId: string, resolution: Resolution): void => {
      postMessage({
        type: 'conflict-resolution',
        conflictId,
        resolution,
      });
    },
    [postMessage]
  );

  // Helper: Send orchestrator control command
  const sendOrchestratorControl = useCallback(
    (action: OrchestratorControlAction, taskId?: string): void => {
      postMessage({
        type: 'orchestrator-control',
        action,
        ...(taskId !== undefined ? { taskId } : {}),
      });
    },
    [postMessage]
  );

  // Memoize the return object to prevent unnecessary re-renders in consumers
  // All the functions are already stable via useCallback, but without useMemo
  // we'd create a new object reference on every render
  return useMemo(
    () => ({
      isConnected,
      sendError,
      requestFix,
      sendPrompt,
      sendCanvasState,
      createSession,
      deleteSession,
      exportComponent,
      sendPerceptionResult,
      sendMcpToolResponse,
      sendConflictResolution,
      sendOrchestratorControl,
      postMessage,
    }),
    [
      isConnected,
      sendError,
      requestFix,
      sendPrompt,
      sendCanvasState,
      createSession,
      deleteSession,
      exportComponent,
      sendPerceptionResult,
      sendMcpToolResponse,
      sendConflictResolution,
      sendOrchestratorControl,
      postMessage,
    ]
  );
}

/**
 * Utility to extract code blocks from AI response
 */
export function extractCodeBlocks(content: string): string[] {
  const codeBlockRegex = /```(?:tsx?|jsx?|javascript|typescript)?\n([\s\S]*?)```/g;
  const blocks: string[] = [];
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match[1] !== undefined) {
      blocks.push(match[1].trim());
    }
  }

  return blocks;
}
