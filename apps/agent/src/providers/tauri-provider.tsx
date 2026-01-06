/**
 * TauriProvider - Manages Tauri event listeners with proper React lifecycle
 *
 * This provider ensures event listeners are:
 * 1. Registered once when the provider mounts
 * 2. Cleaned up properly on unmount (including HMR)
 * 3. Never duplicated using abort pattern for async setup
 */

import { formatZodError } from '@snowflake/shared-schemas';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { ExtensionMessage, WebviewMessage } from '@/types/protocol';
import type { FC, ReactNode } from 'react';

import { trace } from '@/dev-monitor';
import {
  onAgentCheckpoint,
  onAgentError,
  onAgentMessage,
  onAgentAcceptModeChanged,
  onAgentPlanModeChanged,
  onAgentPermissionRequest,
  onAgentSessionInit,
  onFileChange,
  onTerminalExit,
  onTerminalForeground,
  onTerminalOutput,
  watchPath,
  getWorkspacePath,
} from '@/lib/api/backend';
import { WebviewMessageSchema } from '@/types/protocol';

// ============================================================================
// Constants
// ============================================================================

/** Paths to ignore for file watching */
const IGNORED_PATH_PATTERNS = [
  '/.git/',
  '/node_modules/',
  '/.next/',
  '/target/',
  '/dist/',
  '/__pycache__/',
  '/.cache/',
];

function shouldIgnorePath(path: string): boolean {
  return IGNORED_PATH_PATTERNS.some((pattern) => path.includes(pattern));
}

/**
 * Post a message to window for other hooks to receive
 */
function postWindowMessage(data: Record<string, unknown>): void {
  window.postMessage(data, '*');
}

// ============================================================================
// React Context
// ============================================================================

type MessageHandler = (message: ExtensionMessage) => void;

interface TauriContextValue {
  /** Whether connected to Tauri backend */
  isConnected: boolean;
  /** Whether in mock mode (browser dev) */
  isMockMode: boolean;
  /** Subscribe to messages - returns unsubscribe function */
  subscribe: (handler: MessageHandler) => () => void;
  /** Post a message to the backend */
  postMessage: (message: WebviewMessage) => void;
}

const TauriContext = createContext<TauriContextValue | null>(null);

function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

// ============================================================================
// Abort Controller for async cleanup
// ============================================================================

/**
 * Simple abort controller for managing async listener registration
 * Using a class so TypeScript doesn't over-optimize the aborted check
 */
class ListenerAbortController {
  private _aborted = false;
  private _unlistenFns: (() => void)[] = [];

  get aborted(): boolean {
    return this._aborted;
  }

  abort(): void {
    this._aborted = true;
  }

  addUnlisten(fn: () => void): void {
    if (this._aborted) {
      // Already aborted - immediately clean up
      fn();
    } else {
      this._unlistenFns.push(fn);
    }
  }

  cleanup(): void {
    this._aborted = true;
    for (const unlisten of this._unlistenFns) {
      try {
        unlisten();
      } catch (err: unknown) {
        console.error('[TauriProvider] Error during cleanup:', err);
      }
    }
    this._unlistenFns = [];
  }
}

// ============================================================================
// Provider Component
// ============================================================================

interface TauriProviderProps {
  children: ReactNode;
}

export const TauriProvider: FC<TauriProviderProps> = ({ children }) => {
  const [isConnected] = useState(() => isTauriEnvironment());
  const [isMockMode] = useState(() => !isTauriEnvironment());

  // Message handler registry
  const handlersRef = useRef<Set<MessageHandler>>(new Set());

  // Track if listeners have been initialized (persists across renders)
  const initializedRef = useRef(false);

  // Initialize Tauri event listeners with proper cleanup
  useEffect(() => {
    // Skip if not in Tauri environment
    if (!isTauriEnvironment()) {
      return;
    }

    // Skip if already initialized (handles StrictMode double-mount)
    if (initializedRef.current) {
      return;
    }

    const controller = new ListenerAbortController();

    async function initializeListeners(): Promise<void> {
      console.warn('[TauriProvider] Initializing Tauri event listeners');

      // Set up all listeners in parallel for faster initialization
      const listenerPromises: Promise<void>[] = [];

      // Agent messages
      listenerPromises.push(
        onAgentMessage((event) => {
          const { sessionId, message } = event;
          const content = message.content ?? '';
          const messageId = crypto.randomUUID();

          // Dev-monitor: Track agent message
          trace.log('info', `sdk:message:${message.type}`, `Agent message: ${message.type}`, {
            sessionId,
            messageType: message.type,
            hasContent: content.length > 0,
            hasUsage: message.usage !== undefined,
          });

          switch (message.type) {
            case 'text':
              postWindowMessage({
                type: 'agent:chunk',
                uuid: crypto.randomUUID(),
                session_id: sessionId,
                message_id: messageId,
                content,
              });
              break;

            case 'thinking':
              postWindowMessage({
                type: 'agent:thinking',
                uuid: crypto.randomUUID(),
                session_id: sessionId,
                message_id: messageId,
                thinking: content,
              });
              break;

            case 'tool_use': {
              const meta = message.metadata;
              const toolId = meta?.toolId ?? crypto.randomUUID();
              const status = meta?.status;
              const toolName = meta?.toolName ?? 'unknown';

              // Debug: Log tool name for debugging widget mismatch issues
              console.warn(
                `[TauriProvider] Tool event: name="${toolName}", status="${String(status)}", id="${toolId}"`
              );

              // Dev-monitor: Track tool use
              if (status === 'success' || status === 'error') {
                trace.log(
                  status === 'error' ? 'error' : 'info',
                  'sdk:tool:end',
                  `Tool ${status}: ${toolName}`,
                  { sessionId, toolName, success: status === 'success' }
                );
                postWindowMessage({
                  type: 'tool:end',
                  uuid: crypto.randomUUID(),
                  session_id: sessionId,
                  message_id: messageId,
                  tool_id: toolId,
                  tool_name: toolName,
                  tool_output: meta?.toolOutput ?? '',
                  success: status === 'success',
                });
              } else {
                trace.log('info', 'sdk:tool:start', `Tool started: ${toolName}`, {
                  sessionId,
                  toolName,
                });
                postWindowMessage({
                  type: 'tool:start',
                  uuid: crypto.randomUUID(),
                  session_id: sessionId,
                  message_id: messageId,
                  tool_id: toolId,
                  tool_name: toolName,
                  tool_input: meta?.toolInput ?? {},
                });
              }
              break;
            }

            case 'result':
            case 'turn_complete': {
              // Dev-monitor: Track completion with token usage
              const usage = message.usage;
              if (usage !== undefined) {
                trace.log('info', 'sdk:complete', 'Agent turn completed', {
                  sessionId,
                  inputTokens: usage.inputTokens,
                  outputTokens: usage.outputTokens,
                  totalTokens: usage.inputTokens + usage.outputTokens,
                });
              }
              postWindowMessage({
                type: 'agent:complete',
                uuid: crypto.randomUUID(),
                session_id: sessionId,
                message_id: messageId,
                // Transform SDK camelCase to protocol snake_case
                usage: usage
                  ? {
                      input_tokens: usage.inputTokens,
                      output_tokens: usage.outputTokens,
                      cache_read_input_tokens: usage.cacheReadInputTokens,
                      cache_creation_input_tokens: usage.cacheCreationInputTokens,
                    }
                  : undefined,
              });
              break;
            }

            case 'turn_cancel':
              trace.log('info', 'sdk:cancel', 'Agent turn cancelled', { sessionId });
              postWindowMessage({
                type: 'agent:complete',
                uuid: crypto.randomUUID(),
                session_id: sessionId,
                message_id: messageId,
                cancelled: true,
              });
              break;

            case 'error':
              trace.log('error', 'sdk:error', `Agent error: ${content.slice(0, 100)}`, {
                sessionId,
              });
              postWindowMessage({
                type: 'agent:error',
                uuid: crypto.randomUUID(),
                session_id: sessionId,
                message_id: messageId,
                error: content,
              });
              break;
          }
        }).then((unlisten) => {
          controller.addUnlisten(unlisten);
        })
      );

      // Permission requests
      listenerPromises.push(
        onAgentPermissionRequest((event) => {
          postWindowMessage({
            type: 'permission:request',
            uuid: crypto.randomUUID(),
            session_id: event.sessionId,
            request_id: event.requestId,
            tool_name: event.toolName,
            tool_input: event.toolInput,
          });
        }).then((unlisten) => {
          controller.addUnlisten(unlisten);
        })
      );

      // Session init
      listenerPromises.push(
        onAgentSessionInit((event) => {
          postWindowMessage({
            type: 'system:init',
            uuid: crypto.randomUUID(),
            session_id: event.sessionId,
            sdk_session_id: event.sdkSessionId,
            is_resumed: event.isResumed,
            is_forked: event.isForked,
          });
        }).then((unlisten) => {
          controller.addUnlisten(unlisten);
        })
      );

      // Plan mode changes
      listenerPromises.push(
        onAgentPlanModeChanged((event) => {
          postWindowMessage({
            type: 'agent:plan_mode',
            uuid: crypto.randomUUID(),
            session_id: event.sessionId,
            enabled: event.enabled,
          });
        }).then((unlisten) => {
          controller.addUnlisten(unlisten);
        })
      );

      // Accept mode changes
      listenerPromises.push(
        onAgentAcceptModeChanged((event) => {
          postWindowMessage({
            type: 'agent:accept_mode',
            uuid: crypto.randomUUID(),
            session_id: event.sessionId,
            enabled: event.enabled,
          });
        }).then((unlisten) => {
          controller.addUnlisten(unlisten);
        })
      );

      // Agent errors
      listenerPromises.push(
        onAgentError((event) => {
          postWindowMessage({
            type: 'agent:error',
            uuid: crypto.randomUUID(),
            session_id: '',
            message_id: crypto.randomUUID(),
            error: event.message,
          });
        }).then((unlisten) => {
          controller.addUnlisten(unlisten);
        })
      );

      // Checkpoint events (for file rewind functionality)
      listenerPromises.push(
        onAgentCheckpoint((event) => {
          postWindowMessage({
            type: 'agent:checkpoint',
            uuid: crypto.randomUUID(),
            session_id: event.sessionId,
            checkpoint_id: event.checkpointId,
          });
        }).then((unlisten) => {
          controller.addUnlisten(unlisten);
        })
      );

      // Terminal output
      listenerPromises.push(
        onTerminalOutput((event) => {
          postWindowMessage({
            type: 'terminal:data',
            uuid: crypto.randomUUID(),
            terminal_id: event.id,
            data: event.data,
          });
        }).then((unlisten) => {
          controller.addUnlisten(unlisten);
        })
      );

      // Terminal exit
      listenerPromises.push(
        onTerminalExit((event) => {
          postWindowMessage({
            type: 'terminal:exited',
            uuid: crypto.randomUUID(),
            terminal_id: event.id,
            exit_code: event.code,
          });
        }).then((unlisten) => {
          controller.addUnlisten(unlisten);
        })
      );

      // Terminal foreground
      listenerPromises.push(
        onTerminalForeground((event) => {
          postWindowMessage({
            type: 'terminal:foreground',
            uuid: crypto.randomUUID(),
            terminal_id: event.id,
            process_name: event.process_name,
            pid: event.pid,
          });
        }).then((unlisten) => {
          controller.addUnlisten(unlisten);
        })
      );

      // Wait for all listeners to be registered
      try {
        await Promise.all(listenerPromises);
      } catch (err: unknown) {
        console.error('[TauriProvider] Failed to setup listeners:', err);
      }

      // File watcher (separate because it depends on workspace path)
      // Note: controller.aborted CAN change during await - linter doesn't understand async mutation
      if (!controller.aborted) {
        try {
          const workspacePath = await getWorkspacePath();
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- aborted can change during await
          if (workspacePath && !controller.aborted) {
            const unlisten = await onFileChange((event) => {
              if (shouldIgnorePath(event.path)) return;

              postWindowMessage({
                type: 'file:changed',
                uuid: crypto.randomUUID(),
                path: event.path,
                change_type: event.type,
              });
            });
            controller.addUnlisten(unlisten);

            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- aborted can change during await
            if (!controller.aborted) {
              await watchPath(workspacePath);
              console.warn('[TauriProvider] File watcher initialized:', workspacePath);
            }
          }
        } catch (err: unknown) {
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- aborted can change during await
          if (!controller.aborted) {
            console.error('[TauriProvider] Failed to setup file watcher:', err);
          }
        }
      }

      if (!controller.aborted) {
        console.warn('[TauriProvider] All Tauri event listeners initialized');
        initializedRef.current = true;
      }
    }

    void initializeListeners();

    // Cleanup function - runs on unmount or HMR
    return () => {
      console.warn('[TauriProvider] Cleaning up Tauri event listeners');
      initializedRef.current = false;
      controller.cleanup();
    };
  }, []);

  // Subscribe function for hooks to register handlers
  const subscribe = useCallback((handler: MessageHandler): (() => void) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  // Post message to backend
  const postMessage = useCallback(
    (message: WebviewMessage): void => {
      const result = WebviewMessageSchema.safeParse(message);
      if (!result.success) {
        console.error('[TauriProvider] Invalid message:', formatZodError(result.error));
        return;
      }

      if (isMockMode) {
        return;
      }

      // Messages are handled by use-tauri.ts which calls Tauri commands directly
    },
    [isMockMode]
  );

  const value = useMemo(
    (): TauriContextValue => ({
      isConnected,
      isMockMode,
      subscribe,
      postMessage,
    }),
    [isConnected, isMockMode, subscribe, postMessage]
  );

  return <TauriContext.Provider value={value}>{children}</TauriContext.Provider>;
};

// ============================================================================
// Hooks
// ============================================================================

export function useTauriContext(): TauriContextValue {
  const context = useContext(TauriContext);
  if (!context) {
    throw new Error('useTauriContext must be used within a TauriProvider');
  }
  return context;
}

/**
 * Hook to subscribe to Tauri messages
 * This is a convenience hook that handles subscription lifecycle
 */
export function useTauriMessages(handler: MessageHandler): void {
  const { subscribe } = useTauriContext();

  useEffect(() => {
    return subscribe(handler);
  }, [subscribe, handler]);
}
