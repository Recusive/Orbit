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
  getState: () => unknown;
  setState: (state: unknown) => void;
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
  // Track processed message UUIDs to prevent duplicate processing
  const processedUuids = useRef(new Set<string>());

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

      // Deduplicate messages by UUID (if present)
      const uuid = 'uuid' in result.data ? result.data.uuid : undefined;
      if (uuid) {
        if (processedUuids.current.has(uuid)) {
          if (debug) {
            console.warn('[Orbit] Ignoring duplicate message:', result.data.type, uuid);
          }
          return;
        }
        processedUuids.current.add(uuid);
        // Limit set size to prevent memory leak
        if (processedUuids.current.size > 1000) {
          const iterator = processedUuids.current.values();
          for (let i = 0; i < 500; i++) {
            const value = iterator.next().value;
            if (value) processedUuids.current.delete(value);
          }
        }
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

  // Send webview:ready when connected to VS Code
  useEffect(() => {
    if (isConnected && apiRef.current && !isMockMode) {
      if (debug) {
        console.warn('[Orbit] Sending webview:ready');
      }
      apiRef.current.postMessage({
        type: 'webview:ready',
        uuid: crypto.randomUUID(),
      });
    }
  }, [isConnected, isMockMode, debug]);

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

  const getState = (): unknown => {
    return apiRef.current?.getState();
  };

  const setState = (state: unknown): void => {
    apiRef.current?.setState(state);
  };

  return { postMessage, getState, setState, isConnected, isMockMode };
}

// ═══════════════════════════════════════════════════════════════
// Mock handler for browser development
// ═══════════════════════════════════════════════════════════════

function handleMockMessage(message: WebviewMessage): void {
  const delay = 100; // Short delay for non-streaming responses

  switch (message.type) {
    case 'message:send': {
      const messageId = crypto.randomUUID();

      // Simulate streaming with multiple chunks over 5 seconds
      setTimeout(() => {
        console.warn('[Mock] Sending chunk 1 at 1000ms');
        window.postMessage(
          {
            type: 'agent:chunk',
            uuid: crypto.randomUUID(),
            session_id: message.session_id,
            message_id: messageId,
            content: 'I received your message: ',
          },
          '*'
        );
      }, 1000);

      setTimeout(() => {
        console.warn('[Mock] Sending chunk 2 at 2000ms');
        window.postMessage(
          {
            type: 'agent:chunk',
            uuid: crypto.randomUUID(),
            session_id: message.session_id,
            message_id: messageId,
            content: `"${message.content}". `,
          },
          '*'
        );
      }, 2000);

      setTimeout(() => {
        console.warn('[Mock] Sending chunk 3 at 3000ms');
        window.postMessage(
          {
            type: 'agent:chunk',
            uuid: crypto.randomUUID(),
            session_id: message.session_id,
            message_id: messageId,
            content: 'Let me help you with that. ',
          },
          '*'
        );
      }, 3000);

      setTimeout(() => {
        console.warn('[Mock] Sending chunk 4 at 4000ms');
        window.postMessage(
          {
            type: 'agent:chunk',
            uuid: crypto.randomUUID(),
            session_id: message.session_id,
            message_id: messageId,
            content: 'This is a longer response to test the indicator.',
          },
          '*'
        );
      }, 4000);

      setTimeout(() => {
        console.warn('[Mock] Sending complete at 5000ms');
        window.postMessage(
          {
            type: 'agent:complete',
            uuid: crypto.randomUUID(),
            session_id: message.session_id,
            message_id: messageId,
            duration_ms: 5000,
          },
          '*'
        );
      }, 5000);
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
      const terminalId = `pty_${String(Date.now())}_${crypto.randomUUID().slice(0, 8)}`;
      setTimeout(() => {
        window.postMessage(
          {
            type: 'terminal:created',
            uuid: crypto.randomUUID(),
            session_id: message.session_id,
            terminal_id: terminalId,
            name: message.name ?? 'zsh',
            pid: 12345,
            cwd: '/mock/workspace',
            shell_type: 'zsh',
            capabilities: {
              cwd_detection: true,
              command_detection: true,
              shell_integration: true,
            },
          },
          '*'
        );
      }, delay);
      break;
    }

    case 'conversation:list': {
      // Return empty list in mock mode
      setTimeout(() => {
        window.postMessage(
          {
            type: 'conversation:list',
            uuid: crypto.randomUUID(),
            conversations: [],
          },
          '*'
        );
      }, delay);
      break;
    }

    case 'conversation:load': {
      // Return empty conversation in mock mode
      setTimeout(() => {
        window.postMessage(
          {
            type: 'conversation:loaded',
            uuid: crypto.randomUUID(),
            session_id: message.session_id,
            title: 'Mock Conversation',
            messages: [],
          },
          '*'
        );
      }, delay);
      break;
    }

    case 'conversation:rewind': {
      // Mock rewind - just echo back the request with empty messages up to rewind point
      setTimeout(() => {
        window.postMessage(
          {
            type: 'conversation:rewound',
            uuid: crypto.randomUUID(),
            session_id: message.session_id,
            new_session_id: message.session_id, // Same session in mock
            rewind_to_message_id: message.message_id,
            messages: [], // In real implementation, this would be truncated messages
          },
          '*'
        );
      }, delay);
      break;
    }

    case 'file:tree:request': {
      // Mock file tree response for development
      const mockPath = message.path ?? '/mock/workspace';
      setTimeout(() => {
        window.postMessage(
          {
            type: 'file:tree:response',
            uuid: crypto.randomUUID(),
            request_uuid: message.uuid,
            path: mockPath,
            children: [
              { name: 'src', path: `${mockPath}/src`, isDirectory: true, isFile: false },
              { name: 'tests', path: `${mockPath}/tests`, isDirectory: true, isFile: false },
              { name: 'node_modules', path: `${mockPath}/node_modules`, isDirectory: true, isFile: false },
              { name: 'package.json', path: `${mockPath}/package.json`, isDirectory: false, isFile: true },
              { name: 'README.md', path: `${mockPath}/README.md`, isDirectory: false, isFile: true },
              { name: 'tsconfig.json', path: `${mockPath}/tsconfig.json`, isDirectory: false, isFile: true },
            ],
          },
          '*'
        );
      }, delay);
      break;
    }

    case 'file:list:request': {
      // Mock file list response for development
      const mockPath = '/mock/workspace';
      setTimeout(() => {
        window.postMessage(
          {
            type: 'file:list:response',
            uuid: crypto.randomUUID(),
            request_uuid: message.uuid,
            files: [
              { name: 'index.ts', path: `${mockPath}/src/index.ts` },
              { name: 'App.tsx', path: `${mockPath}/src/App.tsx` },
              { name: 'main.tsx', path: `${mockPath}/src/main.tsx` },
              { name: 'utils.ts', path: `${mockPath}/src/utils.ts` },
              { name: 'package.json', path: `${mockPath}/package.json` },
              { name: 'README.md', path: `${mockPath}/README.md` },
              { name: 'tsconfig.json', path: `${mockPath}/tsconfig.json` },
            ],
          },
          '*'
        );
      }, delay);
      break;
    }

    // No mock responses needed for these message types
    case 'webview:ready':
    case 'message:edit':
    case 'message:delete':
    case 'conversation:delete':
    case 'conversation:updateTitle':
    case 'agent:start':
    case 'agent:stop':
    case 'agent:pause':
    case 'agent:resume':
    case 'terminal:close':
    case 'terminal:command':
    case 'terminal:clear':
    case 'terminal:write':
    case 'terminal:resize':
    case 'terminal:signal':
    case 'terminal:ack':
    case 'file:open':
    case 'file:read':
    case 'file:write':
    case 'file:accept':
    case 'file:reject':
    case 'file:accept_all':
    case 'file:reject_all':
    case 'diff:open':
    case 'url:open':
    case 'inputMode:set':
    case 'permission:response':
    case 'thinking:set':
    case 'model:set':
    case 'browser:create':
    case 'browser:navigate':
    case 'browser:back':
    case 'browser:forward':
    case 'browser:reload':
    case 'browser:stop':
    case 'browser:select-element:start':
    case 'browser:select-element:cancel':
    case 'browser:bounds':
    case 'browser:destroy':
    case 'browser:show':
    case 'browser:hide':
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
        // Not relevant for agent stream handling (these types have session_id but aren't agent events)
        case 'system:init':
        case 'terminal:output':
        case 'terminal:created':
        case 'conversation:created':
        case 'conversation:deleted':
        case 'conversation:loaded':
        case 'conversation:rewound':
        case 'permission:request':
        case 'inputMode:changed':
        case 'agent:thinking':
        case 'thinking:changed':
        case 'model:changed':
          break;
        // Note: terminal:data, terminal:exited, terminal:cwd, terminal:command:start,
        // terminal:command:end, terminal:capabilities have terminal_id instead of session_id
        // so they are filtered out by the session_id check above
      }
    },
    [sessionId, onChunk, onComplete, onError, onToolStart, onToolEnd]
  );

  useVSCode({ onMessage: handleMessage });
}
