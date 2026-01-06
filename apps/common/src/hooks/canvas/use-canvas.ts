/**
 * Canvas Hook - Tauri integration for canvas agent
 *
 * Provides methods to interact with the canvas agent backend
 * and listens for canvas events from the sidecar.
 */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useCallback, useEffect, useRef } from 'react';

import type {
  CanvasErrorPayload,
  CanvasMessagePayload,
  CanvasSessionConfig,
  CanvasState,
  CanvasToolRequestPayload,
  McpToolRequest,
  McpToolResponse,
  SDKMessage,
} from '../../types/canvas';
import type { UnlistenFn } from '@tauri-apps/api/event';

// =============================================================================
// TYPES
// =============================================================================

export interface UseCanvasOptions {
  /** Called when agent sends a message */
  onMessage?: (sessionId: string, message: SDKMessage) => void;
  /** Called when agent requests tool execution */
  onToolRequest?: (sessionId: string, request: McpToolRequest) => void;
  /** Called on canvas agent error */
  onError?: (sessionId: string, error: string) => void;
}

export interface UseCanvasReturn {
  /** Create a new canvas session */
  createSession: (sessionId: string, config?: CanvasSessionConfig) => Promise<void>;
  /** Delete a canvas session */
  deleteSession: (sessionId: string) => Promise<void>;
  /** Send a message to canvas agent with current state */
  sendMessage: (sessionId: string, message: string, state: CanvasState) => Promise<void>;
  /** Interrupt current canvas agent operation */
  interrupt: (sessionId: string) => Promise<void>;
  /** Send tool response back to canvas agent */
  sendToolResponse: (sessionId: string, response: McpToolResponse) => Promise<void>;
}

// =============================================================================
// HOOK
// =============================================================================

export function useCanvas(options: UseCanvasOptions = {}): UseCanvasReturn {
  const { onMessage, onToolRequest, onError } = options;

  // Store callbacks in refs to avoid re-subscribing on every render
  const onMessageRef = useRef(onMessage);
  const onToolRequestRef = useRef(onToolRequest);
  const onErrorRef = useRef(onError);

  // Update refs when callbacks change
  useEffect(() => {
    onMessageRef.current = onMessage;
    onToolRequestRef.current = onToolRequest;
    onErrorRef.current = onError;
  }, [onMessage, onToolRequest, onError]);

  // Subscribe to Tauri events
  useEffect(() => {
    const unlisteners: UnlistenFn[] = [];

    const setupListeners = async (): Promise<void> => {
      // Canvas message event
      const unlistenMessage = await listen<CanvasMessagePayload>('canvas:message', (event) => {
        onMessageRef.current?.(event.payload.sessionId, event.payload.message);
      });
      unlisteners.push(unlistenMessage);

      // Canvas tool request event
      const unlistenToolRequest = await listen<CanvasToolRequestPayload>(
        'canvas:tool_request',
        (event) => {
          onToolRequestRef.current?.(event.payload.sessionId, event.payload.request);
        }
      );
      unlisteners.push(unlistenToolRequest);

      // Canvas error event
      const unlistenError = await listen<CanvasErrorPayload>('canvas:error', (event) => {
        onErrorRef.current?.(event.payload.sessionId, event.payload.error);
      });
      unlisteners.push(unlistenError);
    };

    setupListeners().catch((err: unknown) => {
      console.error('[useCanvas] Failed to setup listeners:', err);
    });

    return (): void => {
      unlisteners.forEach((unlisten) => {
        unlisten();
      });
    };
  }, []);

  // =============================================================================
  // COMMANDS
  // =============================================================================

  const createSession = useCallback(
    async (sessionId: string, config?: CanvasSessionConfig): Promise<void> => {
      await invoke('canvas_create_session', { sessionId, config });
    },
    []
  );

  const deleteSession = useCallback(async (sessionId: string): Promise<void> => {
    await invoke('canvas_delete_session', { sessionId });
  }, []);

  const sendMessage = useCallback(
    async (sessionId: string, message: string, state: CanvasState): Promise<void> => {
      await invoke('canvas_send_message', { sessionId, message, state });
    },
    []
  );

  const interrupt = useCallback(async (sessionId: string): Promise<void> => {
    await invoke('canvas_interrupt', { sessionId });
  }, []);

  const sendToolResponse = useCallback(
    async (sessionId: string, response: McpToolResponse): Promise<void> => {
      await invoke('canvas_tool_response', { sessionId, response });
    },
    []
  );

  return {
    createSession,
    deleteSession,
    sendMessage,
    interrupt,
    sendToolResponse,
  };
}
