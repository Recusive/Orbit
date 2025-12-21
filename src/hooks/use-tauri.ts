import { useCallback, useEffect, useRef, useState } from 'react';

import type { FileEntry } from '@/lib/backend';
import type { ExtensionMessage, WebviewMessage } from '@/types/protocol';

import {
  listDirectory,
  readFile,
  getWorkspacePath,
  lspSetWorkspace,
  createTerminal,
  writeTerminal,
  resizeTerminal,
  closeTerminal,
  onTerminalOutput,
  onTerminalExit,
  watchPath,
  onFileChange,
} from '@/lib/backend';
import { ExtensionMessageSchema, WebviewMessageSchema } from '@/types/protocol';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

type MessageHandler = (message: ExtensionMessage) => void;

export interface UseTauriOptions {
  onMessage?: MessageHandler;
  debug?: boolean;
}

export interface UseTauriReturn {
  postMessage: (message: WebviewMessage) => void;
  isConnected: boolean;
  isMockMode: boolean;
}

// ═══════════════════════════════════════════════════════════════
// Tauri API Detection
// ═══════════════════════════════════════════════════════════════

function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

// ═══════════════════════════════════════════════════════════════
// Terminal Listener Singleton
// ═══════════════════════════════════════════════════════════════

let terminalListenersInitialized = false;

async function initTerminalListeners(): Promise<void> {
  if (terminalListenersInitialized) return;
  terminalListenersInitialized = true;

  try {
    await onTerminalOutput((event) => {
      window.postMessage(
        {
          type: 'terminal:data',
          uuid: crypto.randomUUID(),
          terminal_id: event.id,
          data: event.data,
        },
        '*'
      );
    });

    await onTerminalExit((event) => {
      window.postMessage(
        {
          type: 'terminal:exited',
          uuid: crypto.randomUUID(),
          terminal_id: event.id,
          exit_code: event.code,
        },
        '*'
      );
    });

    console.warn('[Snowflake] Terminal event listeners initialized');
  } catch (err) {
    console.error('[Snowflake] Failed to set up terminal listeners:', err);
    terminalListenersInitialized = false;
  }
}

// ═══════════════════════════════════════════════════════════════
// File Watcher Singleton
// ═══════════════════════════════════════════════════════════════

let fileWatcherInitialized = false;
let watchedWorkspacePath: string | null = null;

/** Paths to ignore for file watching (reduces noise) */
const IGNORED_PATH_PATTERNS = [
  '/.git/',
  '/node_modules/',
  '/.next/',
  '/target/',
  '/dist/',
  '/__pycache__/',
  '/.cache/',
];

/** Check if a path should be ignored */
function shouldIgnorePath(path: string): boolean {
  return IGNORED_PATH_PATTERNS.some((pattern) => path.includes(pattern));
}

/** Debounce file change events to avoid rapid re-fetches */
const pendingFileChanges = new Map<
  string,
  { type: string; timeout: ReturnType<typeof setTimeout> }
>();
const DEBOUNCE_MS = 150;

function emitFileChanged(path: string, changeType: string): void {
  // Clear any pending event for this path
  const pending = pendingFileChanges.get(path);
  if (pending) {
    clearTimeout(pending.timeout);
  }

  // Schedule the event with debouncing
  const timeout = setTimeout(() => {
    pendingFileChanges.delete(path);
    window.postMessage(
      {
        type: 'file:changed',
        uuid: crypto.randomUUID(),
        path,
        change_type: changeType,
      },
      '*'
    );
  }, DEBOUNCE_MS);

  pendingFileChanges.set(path, { type: changeType, timeout });
}

async function initFileWatcher(workspacePath: string): Promise<void> {
  // If already watching this path, skip
  if (fileWatcherInitialized && watchedWorkspacePath === workspacePath) {
    return;
  }

  // If watching a different path, we're switching workspaces
  if (fileWatcherInitialized && watchedWorkspacePath && watchedWorkspacePath !== workspacePath) {
    // Unwatch old workspace
    try {
      const { unwatchPath } = await import('@/lib/backend');
      await unwatchPath(watchedWorkspacePath);
      console.warn('[Snowflake] Unwatched old workspace:', watchedWorkspacePath);
    } catch (err) {
      console.warn('[Snowflake] Failed to unwatch old workspace:', err);
    }
  }

  // Set up file change listener (once)
  if (!fileWatcherInitialized) {
    fileWatcherInitialized = true;

    try {
      await onFileChange((event) => {
        // Filter: ignore if not in current workspace
        if (watchedWorkspacePath && !event.path.startsWith(watchedWorkspacePath)) {
          return;
        }

        // Filter: ignore .git, node_modules, etc.
        if (shouldIgnorePath(event.path)) {
          return;
        }

        // Convert file:change event to file:changed message format
        // Handle 'renamed' by emitting delete + create
        if (event.type === 'renamed' && event.newPath) {
          // Only emit if newPath is also in workspace and not ignored
          if (
            watchedWorkspacePath &&
            event.newPath.startsWith(watchedWorkspacePath) &&
            !shouldIgnorePath(event.newPath)
          ) {
            emitFileChanged(event.path, 'deleted');
            emitFileChanged(event.newPath, 'created');
          } else {
            // Just treat as delete if renamed outside workspace
            emitFileChanged(event.path, 'deleted');
          }
        } else {
          // Forward as-is for created/modified/deleted
          emitFileChanged(event.path, event.type);
        }
      });

      console.warn('[Snowflake] File change listener initialized');
    } catch (err) {
      console.error('[Snowflake] Failed to set up file change listener:', err);
      fileWatcherInitialized = false;
      return;
    }
  }

  // Start watching the workspace path
  try {
    await watchPath(workspacePath);
    watchedWorkspacePath = workspacePath;
    console.warn('[Snowflake] Watching workspace:', workspacePath);
  } catch (err) {
    console.error('[Snowflake] Failed to watch workspace:', err);
  }
}

// ═══════════════════════════════════════════════════════════════
// Tauri Message Handler
// ═══════════════════════════════════════════════════════════════

async function handleTauriMessage(message: WebviewMessage): Promise<void> {
  // Handle file tree requests
  if (message.type === 'file:tree:request') {
    try {
      // Get workspace path or use provided path
      // Default to home directory if no path set
      let targetPath: string | undefined = message.path;
      if (targetPath === undefined || targetPath === '') {
        const storedPath = await getWorkspacePath();
        // Fallback to a reasonable default - user's home or root
        targetPath = storedPath ?? '/Users/no9labs/Developer/Recursive/Snowflake-v0';
      }

      // Set workspace for LSP - this initializes language servers for the workspace
      lspSetWorkspace(targetPath).catch((err: unknown) => {
        console.warn('[Snowflake] Failed to set LSP workspace:', err);
      });

      // Start watching the workspace for file changes (for auto-refresh)
      initFileWatcher(targetPath).catch((err: unknown) => {
        console.warn('[Snowflake] Failed to initialize file watcher:', err);
      });

      const entries = await listDirectory(targetPath, false);

      // Convert FileEntry to FileNode format
      const children = entries.map((entry: FileEntry) => ({
        name: entry.name,
        path: entry.path,
        isDirectory: entry.isDir,
        isFile: !entry.isDir,
      }));

      window.postMessage(
        {
          type: 'file:tree:response',
          uuid: crypto.randomUUID(),
          request_uuid: message.uuid,
          path: targetPath,
          children,
        },
        '*'
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      window.postMessage(
        {
          type: 'file:tree:error',
          uuid: crypto.randomUUID(),
          request_uuid: message.uuid,
          error: errorMessage,
        },
        '*'
      );
    }
    return;
  }

  // Handle file read requests
  if (message.type === 'file:read') {
    try {
      const content = await readFile(message.path);
      window.postMessage(
        {
          type: 'file:content',
          uuid: crypto.randomUUID(),
          request_uuid: message.uuid,
          path: message.path,
          content,
        },
        '*'
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to read file';
      window.postMessage(
        {
          type: 'error',
          uuid: crypto.randomUUID(),
          message: errorMessage,
        },
        '*'
      );
    }
    return;
  }

  // Handle terminal creation
  if (message.type === 'terminal:create') {
    try {
      const info = await createTerminal(
        message.session_id,
        undefined, // cwd - use default
        undefined, // shell - use default
        message.cols,
        message.rows
      );
      window.postMessage(
        {
          type: 'terminal:created',
          uuid: crypto.randomUUID(),
          session_id: message.session_id,
          terminal_id: info.id,
          name: message.name ?? info.shell,
          pid: info.pid,
          cwd: info.cwd,
          shell_type: info.shell,
          capabilities: {
            cwd_detection: true,
            command_detection: true,
            shell_integration: true,
          },
        },
        '*'
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create terminal';
      console.error('[Snowflake] Terminal creation error:', errorMessage);
    }
    return;
  }

  // Handle terminal write
  if (message.type === 'terminal:write') {
    try {
      await writeTerminal(message.terminal_id, message.data);
    } catch (err: unknown) {
      console.error('[Snowflake] Terminal write error:', err);
    }
    return;
  }

  // Handle terminal resize
  if (message.type === 'terminal:resize') {
    try {
      await resizeTerminal(message.terminal_id, message.cols, message.rows);
    } catch (err: unknown) {
      console.error('[Snowflake] Terminal resize error:', err);
    }
    return;
  }

  // Handle terminal close
  if (message.type === 'terminal:close') {
    try {
      await closeTerminal(message.terminal_id);
    } catch (err: unknown) {
      console.error('[Snowflake] Terminal close error:', err);
    }
    return;
  }

  // Other message types are handled elsewhere or not applicable
}

// ═══════════════════════════════════════════════════════════════
// Hook
// ═══════════════════════════════════════════════════════════════

export function useTauri(options: UseTauriOptions = {}): UseTauriReturn {
  const { onMessage, debug = false } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [isMockMode, setIsMockMode] = useState(false);
  const handlerRef = useRef(onMessage);

  handlerRef.current = onMessage;

  // Initialize Tauri connection
  useEffect(() => {
    const isTauri = isTauriEnvironment();
    if (isTauri) {
      setIsConnected(true);
      setIsMockMode(false);
      if (debug) console.warn('[Snowflake] Connected to Tauri backend');
    } else {
      setIsConnected(false);
      setIsMockMode(true);
      if (debug) console.warn('[Snowflake] Mock mode - no Tauri backend');
    }
  }, [debug]);

  // Listen for messages with Zod validation
  const processedUuids = useRef(new Set<string>());

  useEffect(() => {
    const handleMessage = (event: MessageEvent<unknown>): void => {
      const result = ExtensionMessageSchema.safeParse(event.data);

      if (!result.success) {
        if (debug) {
          console.warn('[Snowflake] Invalid message:', event.data);
          console.warn('[Snowflake] Errors:', result.error.issues);
        }
        return;
      }

      // Deduplicate messages by UUID (if present)
      const uuid = 'uuid' in result.data ? result.data.uuid : undefined;
      if (uuid) {
        if (processedUuids.current.has(uuid)) {
          if (debug) {
            console.warn('[Snowflake] Ignoring duplicate message:', result.data.type, uuid);
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
        console.warn('[Snowflake] Received:', result.data.type);
      }

      handlerRef.current?.(result.data);
    };

    window.addEventListener('message', handleMessage);
    return (): void => {
      window.removeEventListener('message', handleMessage);
    };
  }, [debug]);

  // Initialize terminal listeners once when connected to Tauri
  useEffect(() => {
    if (isConnected && !isMockMode) {
      if (debug) {
        console.warn('[Snowflake] Connected to Tauri, initializing terminal listeners');
      }
      // Initialize terminal listeners (singleton - only runs once)
      initTerminalListeners().catch(console.error);
    }
  }, [isConnected, isMockMode, debug]);

  // Send message with validation
  const postMessage = useCallback(
    (message: WebviewMessage): void => {
      const result = WebviewMessageSchema.safeParse(message);
      if (!result.success) {
        console.error('[Snowflake] Invalid outgoing message:', result.error.issues);
        return;
      }

      if (debug) {
        console.warn('[Snowflake] Sending:', message.type);
      }

      if (isConnected && !isMockMode) {
        // Handle message via Tauri commands
        handleTauriMessage(message).catch((err: unknown) => {
          console.error('[Snowflake] Tauri message error:', err);
        });
      } else if (isMockMode) {
        if (debug) console.warn('[Snowflake Mock]', message);
        handleMockMessage(message);
      }
    },
    [isConnected, isMockMode, debug]
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

      setTimeout(() => {
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
        window.postMessage(
          {
            type: 'agent:complete',
            uuid: crypto.randomUUID(),
            session_id: message.session_id,
            message_id: messageId,
            duration_ms: 3000,
          },
          '*'
        );
      }, 4000);
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
      setTimeout(() => {
        window.postMessage(
          {
            type: 'conversation:rewound',
            uuid: crypto.randomUUID(),
            session_id: message.session_id,
            new_session_id: message.session_id,
            rewind_to_message_id: message.message_id,
            messages: [],
          },
          '*'
        );
      }, delay);
      break;
    }

    case 'file:tree:request': {
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
              {
                name: 'package.json',
                path: `${mockPath}/package.json`,
                isDirectory: false,
                isFile: true,
              },
              {
                name: 'README.md',
                path: `${mockPath}/README.md`,
                isDirectory: false,
                isFile: true,
              },
            ],
          },
          '*'
        );
      }, delay);
      break;
    }

    case 'file:list:request': {
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
            ],
          },
          '*'
        );
      }, delay);
      break;
    }

    // All other message types don't need mock responses
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
    case 'permission:response':
    case 'inputMode:set':
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
    case 'browser:devtools':
    case 'browser:show':
    case 'browser:hide':
    case 'subagents:list':
    case 'subagents:create':
    case 'subagents:update':
    case 'subagents:delete':
    case 'commands:list':
    case 'commands:create':
    case 'commands:update':
    case 'commands:delete':
    case 'subagents:generate':
    case 'commands:generate':
      break;
  }
}

// ═══════════════════════════════════════════════════════════════
// Convenience hooks
// ═══════════════════════════════════════════════════════════════

export interface AgentStreamCallbacks {
  onChunk: (content: string, messageId: string) => void;
  onComplete: (messageId: string, usage?: { input_tokens: number; output_tokens: number }) => void;
  onError: (error: string, messageId: string) => void;
  onToolStart?: (toolName: string, messageId: string) => void;
  onToolEnd?: (toolName: string, success: boolean, messageId: string) => void;
}

export function useAgentStream(sessionId: string, callbacks: AgentStreamCallbacks): void {
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
        // All other message types with session_id not relevant to agent streaming
        case 'system:init':
        case 'agent:thinking':
        case 'permission:request':
        case 'inputMode:changed':
        case 'thinking:changed':
        case 'model:changed':
        case 'terminal:output':
        case 'terminal:created':
        case 'conversation:created':
        case 'conversation:deleted':
        case 'conversation:loaded':
        case 'conversation:rewound':
          break;
      }
    },
    [sessionId, onChunk, onComplete, onError, onToolStart, onToolEnd]
  );

  useTauri({ onMessage: handleMessage });
}
