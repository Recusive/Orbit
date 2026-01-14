/**
 * TauriProvider - Manages Tauri event listeners with proper React lifecycle
 *
 * This provider ensures event listeners are:
 * 1. Registered once when the provider mounts
 * 2. Cleaned up properly on unmount (including HMR)
 * 3. Never duplicated using abort pattern for async setup
 */

import { createLogger } from '@orbit/common/lib';
import { formatZodError } from '@orbit/shared-schemas';
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

import {
  onAgentCheckpoint,
  onAgentError,
  onAgentMessage,
  onAgentAcceptModeChanged,
  onAgentPlanModeChanged,
  onAgentPermissionRequest,
  onAgentSessionInit,
  onBrowserLoading,
  onBrowserNavigated,
  onFileChange,
  onTerminalExit,
  onTerminalForeground,
  onTerminalOutput,
  watchPath,
  getWorkspacePath,
} from '@/lib/api';
import { WebviewMessageSchema } from '@/types/protocol';

// ============================================================================
// Constants
// ============================================================================

/** Paths to ignore for file watching */
const IGNORED_PATH_PATTERNS = [
  // Version control
  '/.git/',
  // JavaScript/Node
  '/node_modules/',
  '/.next/',
  '/dist/',
  '/build/',
  '/.turbo/',
  '/.parcel-cache/',
  // Python
  '/venv/',
  '/.venv/',
  '/site-packages/',
  '/__pycache__/',
  '/.mypy_cache/',
  '/.pytest_cache/',
  '/env/',
  '/.env/',
  // Rust
  '/target/',
  // General
  '/.cache/',
  '/.DS_Store',
  '/coverage/',
  '/.idea/',
  '/.vscode/',
];

function shouldIgnorePath(path: string): boolean {
  return IGNORED_PATH_PATTERNS.some((pattern) => path.includes(pattern));
}

const logger = createLogger('TauriProvider');

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
 * Simple abort controller for managing async listener registration.
 *
 * Uses isAborted() method instead of a getter property because TypeScript's
 * control flow analysis narrows getter properties after conditional checks,
 * but doesn't narrow method return values. This is important because the
 * aborted state CAN change during await boundaries when cleanup is called.
 */
class ListenerAbortController {
  private _aborted = false;
  private _unlistenFns: (() => void)[] = [];

  /**
   * Check if abort has been requested.
   * Use this method instead of a property to prevent TypeScript narrowing.
   */
  isAborted(): boolean {
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
        logger.error('Error during cleanup', err instanceof Error ? err : new Error(String(err)));
      }
    }
    this._unlistenFns = [];
  }
}

// ============================================================================
// File Watcher Setup (extracted to avoid ESLint false positives)
// ============================================================================

/**
 * Setup file watcher with proper abort handling.
 *
 * Extracted to a separate function because TypeScript's flow analysis doesn't
 * understand that `controller.isAborted()` can change during `await` statements
 * (the cleanup function can be called from React while we're awaiting).
 *
 * By using a function that takes the controller, we make it clear to both
 * TypeScript and readers that the aborted state needs to be checked after
 * each await.
 */
async function setupFileWatcher(controller: ListenerAbortController): Promise<void> {
  // Check abort state before starting
  if (controller.isAborted()) return;

  try {
    const workspacePath = await getWorkspacePath();

    // Check again after await - cleanup may have been called
    if (!workspacePath || controller.isAborted()) return;

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

    // Check again after await - cleanup may have been called
    if (controller.isAborted()) return;

    await watchPath(workspacePath);
    logger.info('File watcher initialized', { workspacePath });
  } catch (err: unknown) {
    // Only log errors if we weren't aborted (avoids noise during cleanup)
    if (!controller.isAborted()) {
      logger.error(
        'Failed to setup file watcher',
        err instanceof Error ? err : new Error(String(err))
      );
    }
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
      logger.info('Initializing Tauri event listeners');

      // Set up all listeners in parallel for faster initialization
      const listenerPromises: Promise<void>[] = [];

      // Agent messages
      listenerPromises.push(
        onAgentMessage((event) => {
          const { sessionId, message } = event;
          const content = message.content ?? '';
          // Use SDK's stable message ID if available (all events in a turn share this ID)
          // Fall back to random UUID only if SDK doesn't provide one (shouldn't happen normally)
          const messageId = message.messageId ?? crypto.randomUUID();

          // Log agent message for debugging
          logger.debug(`Agent message: ${message.type}`, {
            sessionId,
            messageType: message.type,
            hasContent: content.length > 0,
            hasUsage: message.usage !== undefined,
            messageId, // Add messageId to debug logs
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

              // Log tool completion
              if (status === 'success' || status === 'error') {
                if (status === 'error') {
                  logger.warn(`Tool ${status}: ${toolName}`, { sessionId, toolName });
                } else {
                  logger.debug(`Tool ${status}: ${toolName}`, { sessionId, toolName });
                }
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
                logger.debug(`Tool started: ${toolName}`, { sessionId, toolName });
                postWindowMessage({
                  type: 'tool:start',
                  uuid: crypto.randomUUID(),
                  session_id: sessionId,
                  message_id: messageId,
                  tool_id: toolId,
                  tool_name: toolName,
                  tool_input: meta?.toolInput ?? {},
                  // Pass through backend-provided content offset for accurate tool positioning
                  content_offset: message.contentOffset,
                });
              }
              break;
            }

            case 'result':
            case 'turn_complete': {
              // Log completion with token usage
              const usage = message.usage;
              if (usage !== undefined) {
                logger.debug('Agent turn completed', {
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
              logger.debug('Agent turn cancelled', { sessionId });
              postWindowMessage({
                type: 'agent:complete',
                uuid: crypto.randomUUID(),
                session_id: sessionId,
                message_id: messageId,
                cancelled: true,
              });
              break;

            case 'error':
              logger.error(`Agent error: ${content.slice(0, 100)}`, undefined, { sessionId });
              postWindowMessage({
                type: 'agent:error',
                uuid: crypto.randomUUID(),
                session_id: sessionId,
                message_id: messageId,
                error: content,
              });
              break;
          }
        })
          .then((unlisten) => {
            controller.addUnlisten(unlisten);
          })
          .catch((err: unknown) => {
            logger.error(
              'Listener registration failed',
              err instanceof Error ? err : new Error(String(err))
            );
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
        })
          .then((unlisten) => {
            controller.addUnlisten(unlisten);
          })
          .catch((err: unknown) => {
            logger.error(
              'Listener registration failed',
              err instanceof Error ? err : new Error(String(err))
            );
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
        })
          .then((unlisten) => {
            controller.addUnlisten(unlisten);
          })
          .catch((err: unknown) => {
            logger.error(
              'Listener registration failed',
              err instanceof Error ? err : new Error(String(err))
            );
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
        })
          .then((unlisten) => {
            controller.addUnlisten(unlisten);
          })
          .catch((err: unknown) => {
            logger.error(
              'Listener registration failed',
              err instanceof Error ? err : new Error(String(err))
            );
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
        })
          .then((unlisten) => {
            controller.addUnlisten(unlisten);
          })
          .catch((err: unknown) => {
            logger.error(
              'Listener registration failed',
              err instanceof Error ? err : new Error(String(err))
            );
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
        })
          .then((unlisten) => {
            controller.addUnlisten(unlisten);
          })
          .catch((err: unknown) => {
            logger.error(
              'Listener registration failed',
              err instanceof Error ? err : new Error(String(err))
            );
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
        })
          .then((unlisten) => {
            controller.addUnlisten(unlisten);
          })
          .catch((err: unknown) => {
            logger.error(
              'Listener registration failed',
              err instanceof Error ? err : new Error(String(err))
            );
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
        })
          .then((unlisten) => {
            controller.addUnlisten(unlisten);
          })
          .catch((err: unknown) => {
            logger.error(
              'Listener registration failed',
              err instanceof Error ? err : new Error(String(err))
            );
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
        })
          .then((unlisten) => {
            controller.addUnlisten(unlisten);
          })
          .catch((err: unknown) => {
            logger.error(
              'Listener registration failed',
              err instanceof Error ? err : new Error(String(err))
            );
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
        })
          .then((unlisten) => {
            controller.addUnlisten(unlisten);
          })
          .catch((err: unknown) => {
            logger.error(
              'Listener registration failed',
              err instanceof Error ? err : new Error(String(err))
            );
          })
      );

      // Browser navigation events
      listenerPromises.push(
        onBrowserNavigated((event) => {
          postWindowMessage({
            type: 'browser:navigated',
            uuid: crypto.randomUUID(),
            url: event.url,
          });
        })
          .then((unlisten) => {
            controller.addUnlisten(unlisten);
          })
          .catch((err: unknown) => {
            logger.error(
              'Browser listener registration failed',
              err instanceof Error ? err : new Error(String(err))
            );
          })
      );

      // Browser loading state events
      listenerPromises.push(
        onBrowserLoading((event) => {
          postWindowMessage({
            type: 'browser:loading',
            uuid: crypto.randomUUID(),
            isLoading: event.is_loading,
          });
        })
          .then((unlisten) => {
            controller.addUnlisten(unlisten);
          })
          .catch((err: unknown) => {
            logger.error(
              'Browser listener registration failed',
              err instanceof Error ? err : new Error(String(err))
            );
          })
      );

      // Wait for all listeners to be registered
      try {
        await Promise.all(listenerPromises);
      } catch (err: unknown) {
        logger.error(
          'Failed to setup listeners',
          err instanceof Error ? err : new Error(String(err))
        );
      }

      // File watcher (separate because it depends on workspace path)
      // Use a separate async function to handle abort checks cleanly
      // The controller.isAborted() state CAN change during await (cleanup called from React)
      await setupFileWatcher(controller);

      if (!controller.isAborted()) {
        logger.info('All Tauri event listeners initialized');
        initializedRef.current = true;
      }
    }

    void initializeListeners();

    // Cleanup function - runs on unmount or HMR
    return () => {
      logger.info('Cleaning up Tauri event listeners');
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
        logger.error('Invalid message', new Error(formatZodError(result.error)));
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
