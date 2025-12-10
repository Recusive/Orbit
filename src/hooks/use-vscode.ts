import { useCallback, useEffect, useRef, useState } from 'react';

import type { ExtensionMessage, WebviewMessage } from '@/types/protocol';

import { ExtensionMessageSchema, WebviewMessageSchema } from '@/types/protocol';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface VSCodeAPI {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare global {
  function acquireVsCodeApi(): VSCodeAPI;
}

type MessageHandler = (message: ExtensionMessage) => void;

export interface UseVSCodeOptions {
  onMessage?: MessageHandler;
  debug?: boolean;
}

export interface UseVSCodeReturn {
  postMessage: (message: WebviewMessage) => void;
  isConnected: boolean;
  isMockMode: boolean;
}

// ═══════════════════════════════════════════════════════════════
// VS Code API Singleton
// ═══════════════════════════════════════════════════════════════

let vscodeApi: VSCodeAPI | null = null;

function getVSCodeAPI(): VSCodeAPI | null {
  if (vscodeApi) return vscodeApi;

  if (typeof acquireVsCodeApi !== 'undefined') {
    try {
      vscodeApi = acquireVsCodeApi();
      return vscodeApi;
    } catch {
      return null;
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// Hook
// ═══════════════════════════════════════════════════════════════

export function useVSCode(options: UseVSCodeOptions = {}): UseVSCodeReturn {
  const { onMessage, debug = false } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [isMockMode, setIsMockMode] = useState(false);
  const apiRef = useRef<VSCodeAPI | null>(null);
  const handlerRef = useRef(onMessage);

  handlerRef.current = onMessage;

  // Initialize API
  useEffect(() => {
    const api = getVSCodeAPI();
    if (api) {
      apiRef.current = api;
      setIsConnected(true);
      setIsMockMode(false);
    } else {
      setIsConnected(false);
      setIsMockMode(true);
      if (debug) console.warn('[Orbit] Mock mode - no VS Code API');
    }
  }, [debug]);

  // Listen for messages with Zod validation
  useEffect(() => {
    const handleMessage = (event: MessageEvent<unknown>): void => {
      const result = ExtensionMessageSchema.safeParse(event.data);

      if (!result.success) {
        if (debug) {
          console.warn('[Orbit] Invalid message:', event.data);
          console.warn('[Orbit] Errors:', result.error.format());
        }
        return;
      }

      if (debug) {
        console.warn('[Orbit] Received:', result.data.type);
      }

      handlerRef.current?.(result.data);
    };

    window.addEventListener('message', handleMessage);
    return (): void => {
      window.removeEventListener('message', handleMessage);
    };
  }, [debug]);

  // Send message with validation
  const postMessage = useCallback(
    (message: WebviewMessage): void => {
      const result = WebviewMessageSchema.safeParse(message);
      if (!result.success) {
        console.error('[Orbit] Invalid outgoing message:', result.error.format());
        return;
      }

      if (debug) {
        console.warn('[Orbit] Sending:', message.type);
      }

      if (apiRef.current) {
        apiRef.current.postMessage(message);
      } else if (isMockMode) {
        if (debug) console.warn('[Orbit Mock]', message);
        handleMockMessage(message);
      }
    },
    [isMockMode, debug]
  );

  return { postMessage, isConnected, isMockMode };
}

// ═══════════════════════════════════════════════════════════════
// Mock handler for browser development
// ═══════════════════════════════════════════════════════════════

function handleMockMessage(message: WebviewMessage): void {
  const delay = 100;

  switch (message.type) {
    case 'message:send': {
      const messageId = crypto.randomUUID();

      // Simulate streaming
      setTimeout(() => {
        window.postMessage(
          {
            type: 'agent:chunk',
            uuid: crypto.randomUUID(),
            session_id: message.session_id,
            message_id: messageId,
            content: 'I received: ',
          },
          '*'
        );
      }, delay);

      setTimeout(() => {
        window.postMessage(
          {
            type: 'agent:chunk',
            uuid: crypto.randomUUID(),
            session_id: message.session_id,
            message_id: messageId,
            content: `"${message.content}"`,
          },
          '*'
        );
      }, delay * 2);

      setTimeout(() => {
        window.postMessage(
          {
            type: 'agent:complete',
            uuid: crypto.randomUUID(),
            session_id: message.session_id,
            message_id: messageId,
            duration_ms: delay * 3,
          },
          '*'
        );
      }, delay * 3);
      break;
    }

    case 'conversation:create': {
      setTimeout(() => {
        window.postMessage(
          {
            type: 'conversation:created',
            uuid: crypto.randomUUID(),
            session_id: crypto.randomUUID(),
            title: message.title ?? 'New Conversation',
          },
          '*'
        );
      }, delay);
      break;
    }

    case 'terminal:create': {
      setTimeout(() => {
        window.postMessage(
          {
            type: 'terminal:created',
            uuid: crypto.randomUUID(),
            session_id: message.session_id,
            name: message.name ?? 'zsh',
          },
          '*'
        );
      }, delay);
      break;
    }

    // No mock responses needed for these message types
    case 'message:edit':
    case 'message:delete':
    case 'conversation:delete':
    case 'conversation:list':
    case 'agent:start':
    case 'agent:stop':
    case 'agent:pause':
    case 'agent:resume':
    case 'terminal:close':
    case 'terminal:command':
    case 'terminal:clear':
    case 'file:open':
    case 'file:read':
    case 'file:write':
    case 'file:accept':
    case 'file:reject':
    case 'file:accept_all':
    case 'file:reject_all':
    case 'diff:open':
      break;
  }
}

// ═══════════════════════════════════════════════════════════════
// Convenience hooks
// ═══════════════════════════════════════════════════════════════

export interface AgentStreamCallbacks {
  onChunk: (content: string, messageId: string) => void;
  onComplete: (
    messageId: string,
    usage?: { input_tokens: number; output_tokens: number }
  ) => void;
  onError: (error: string, messageId: string) => void;
  onToolStart?: (toolName: string, messageId: string) => void;
  onToolEnd?: (toolName: string, success: boolean, messageId: string) => void;
}

export function useAgentStream(
  sessionId: string,
  callbacks: AgentStreamCallbacks
): void {
  const { onChunk, onComplete, onError, onToolStart, onToolEnd } = callbacks;

  const handleMessage = useCallback(
    (message: ExtensionMessage) => {
      if (!('session_id' in message) || message.session_id !== sessionId) {
        return;
      }

      switch (message.type) {
        case 'agent:chunk':
          onChunk(message.content, message.message_id);
          break;
        case 'agent:complete':
          onComplete(message.message_id, message.usage);
          break;
        case 'agent:error':
          onError(message.error, message.message_id);
          break;
        case 'tool:start':
          onToolStart?.(message.tool_name, message.message_id);
          break;
        case 'tool:end':
          onToolEnd?.(message.tool_name, message.success, message.message_id);
          break;
        // Not relevant for agent stream handling (these types have session_id)
        case 'system:init':
        case 'terminal:output':
        case 'terminal:created':
        case 'terminal:exited':
        case 'conversation:created':
        case 'conversation:deleted':
          break;
      }
    },
    [sessionId, onChunk, onComplete, onError, onToolStart, onToolEnd]
  );

  useVSCode({ onMessage: handleMessage });
}
