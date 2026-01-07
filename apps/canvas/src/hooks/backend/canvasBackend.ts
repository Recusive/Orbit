/**
 * Canvas Backend - Tauri invoke/listen functions for canvas operations
 *
 * This module provides Tauri-based communication for the Canvas app.
 * All functions use Tauri invoke() for commands and listen() for events.
 */

import type { OrchestratorControlAction } from '../../types/ipcProtocol';

// ============================================
// Tauri Detection & Imports
// ============================================

const IS_TAURI = typeof window !== 'undefined' && '__TAURI__' in window;

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!IS_TAURI) {
    // Mock mode for browser development
    console.warn(`[Canvas Mock] invoke('${command}')`, args);
    throw new Error(`Tauri not available. Cannot invoke '${command}'`);
  }
  const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
  return tauriInvoke<T>(command, args);
}

type EventCallback<T> = (payload: T) => void;

async function listen<T>(event: string, callback: EventCallback<T>): Promise<() => void> {
  if (!IS_TAURI) {
    console.warn(`[Canvas Mock] listen('${event}')`);
    return (): void => {
      // No-op for mock mode
    };
  }
  const { listen: tauriListen } = await import('@tauri-apps/api/event');
  const unlisten = await tauriListen<T>(event, (e): void => {
    callback(e.payload);
  });
  return unlisten;
}

// ============================================
// Types
// ============================================

/** SDK message types from the backend */
export type SDKMessageType = 'text' | 'thinking' | 'tool_use' | 'error' | 'result';

export interface SDKMessage {
  type: SDKMessageType;
  content: string;
  done?: boolean;
  metadata?: {
    toolName?: string;
    toolId?: string;
    toolInput?: unknown;
    status?: string;
    nodeId?: string;
  };
}

export interface McpToolRequest {
  requestId: string;
  tool: string;
  args: Record<string, unknown>;
}

export interface CanvasState {
  nodes: unknown[];
  edges: unknown[];
  selectedNodeId?: string | undefined;
  selectedNodeType?: 'sandpack' | 'page' | undefined;
}

export interface SessionConfig {
  model?: string;
  cwd?: string;
}

// ============================================
// Canvas Session Operations
// ============================================

/**
 * Create a new canvas session
 */
export async function canvasCreateSession(
  sessionId: string,
  config?: SessionConfig
): Promise<void> {
  return invoke('canvas_create_session', {
    sessionId,
    config: config ?? {},
  });
}

/**
 * Delete a canvas session
 */
export async function canvasDeleteSession(sessionId: string): Promise<void> {
  return invoke('canvas_delete_session', { sessionId });
}

/**
 * Send a message to the canvas agent
 */
export async function canvasSendMessage(
  sessionId: string,
  message: string,
  canvasState: CanvasState
): Promise<void> {
  return invoke('canvas_send_message', {
    sessionId,
    message,
    canvasState,
  });
}

/**
 * Stop the current canvas agent operation
 */
export async function canvasStopAgent(sessionId: string): Promise<void> {
  return invoke('canvas_stop_agent', { sessionId });
}

/**
 * Send a tool response back to the canvas agent
 */
export async function canvasToolResponse(
  sessionId: string,
  requestId: string,
  success: boolean,
  result?: unknown,
  error?: string
): Promise<void> {
  return invoke('canvas_tool_response', {
    sessionId,
    response: {
      requestId,
      success,
      result,
      error,
    },
  });
}

/**
 * Send orchestrator control command
 */
export async function canvasOrchestratorControl(
  sessionId: string,
  action: OrchestratorControlAction,
  taskId?: string
): Promise<void> {
  return invoke('canvas_orchestrator_control', {
    sessionId,
    action,
    taskId,
  });
}

// ============================================
// Event Listeners
// ============================================

export interface CanvasMessageEvent {
  sessionId: string;
  message: SDKMessage;
}

export interface CanvasToolRequestEvent {
  sessionId: string;
  request: McpToolRequest;
}

export interface CanvasErrorEvent {
  sessionId: string;
  error: string;
}

/**
 * Listen for canvas agent messages
 */
export async function onCanvasMessage(
  callback: EventCallback<CanvasMessageEvent>
): Promise<() => void> {
  return listen<CanvasMessageEvent>('canvas:message', callback);
}

/**
 * Listen for canvas tool requests
 */
export async function onCanvasToolRequest(
  callback: EventCallback<CanvasToolRequestEvent>
): Promise<() => void> {
  return listen<CanvasToolRequestEvent>('canvas:tool_request', callback);
}

/**
 * Listen for canvas errors
 */
export async function onCanvasError(
  callback: EventCallback<CanvasErrorEvent>
): Promise<() => void> {
  return listen<CanvasErrorEvent>('canvas:error', callback);
}

// ============================================
// Utility
// ============================================

/**
 * Check if running in Tauri environment
 */
export function isTauriEnvironment(): boolean {
  return IS_TAURI;
}
