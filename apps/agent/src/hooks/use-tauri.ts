import { formatZodError } from '@snowflake/shared-schemas';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { AttachmentContentBlock, FileEntry, SessionConfig } from '@/lib/backend';
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
  watchPath,
  onFileChange,
  // Agent SDK operations
  agentCreateSession,
  agentSendMessage,
  agentInterrupt,
  agentRespondPermission,
  agentSetThinkingMode,
  agentSetModel,
  agentSetPlanMode,
  agentSetAcceptMode,
  // Conversation operations
  conversationCreate,
  conversationList,
  conversationLoad,
  conversationDelete,
  conversationUpdateTitle,
  conversationFork,
  // Subagent operations
  listAgents,
  createAgent,
  updateAgent,
  deleteAgent,
  generateAgentDefinition,
  // Command operations
  listCommands,
  createCommand,
  updateCommand,
  deleteCommand,
  generateCommandDefinition,
} from '@/lib/backend';
import { useUIStore } from '@/stores/ui-store';
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
// File Watcher Singleton
// NOTE: Terminal and agent listeners are now initialized by TauriProvider
// This ensures proper React lifecycle management and HMR support
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
// Agent Listener Singleton
// ═══════════════════════════════════════════════════════════════

// Use window-level state to persist across Vite HMR reloads
// This prevents duplicate listeners when the module is hot-reloaded
declare global {
  interface Window {
    __SNOWFLAKE_AGENT_LISTENERS_INITIALIZED__?: boolean;
    __SNOWFLAKE_AGENT_LISTENER_UNLISTEN__?: (() => void) | null;
  }
}

// Clean up on HMR to prevent listener accumulation
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (window.__SNOWFLAKE_AGENT_LISTENER_UNLISTEN__) {
      window.__SNOWFLAKE_AGENT_LISTENER_UNLISTEN__();
      window.__SNOWFLAKE_AGENT_LISTENER_UNLISTEN__ = null;
      window.__SNOWFLAKE_AGENT_LISTENERS_INITIALIZED__ = false;
      console.warn('[Snowflake] Agent listeners cleaned up for HMR');
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// Window Message Listener Singleton
// ═══════════════════════════════════════════════════════════════

// Use window-level state to persist across Vite HMR reloads
declare global {
  interface Window {
    __SNOWFLAKE_MESSAGE_HANDLERS__?: Set<(message: ExtensionMessage) => void>;
    __SNOWFLAKE_WINDOW_LISTENER_INITIALIZED__?: boolean;
    __SNOWFLAKE_REMOVE_WINDOW_LISTENER__?: (() => void) | null;
  }
}

// Initialize global handler registry if not present
window.__SNOWFLAKE_MESSAGE_HANDLERS__ ??= new Set();

// Clean up window listener on HMR
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (window.__SNOWFLAKE_REMOVE_WINDOW_LISTENER__) {
      window.__SNOWFLAKE_REMOVE_WINDOW_LISTENER__();
      window.__SNOWFLAKE_REMOVE_WINDOW_LISTENER__ = null;
      window.__SNOWFLAKE_WINDOW_LISTENER_INITIALIZED__ = false;
      console.warn('[Snowflake] Window message listener cleaned up for HMR');
    }
  });
}

// Registry of message handlers - each useTauri hook registers its handler here
const messageHandlers = window.__SNOWFLAKE_MESSAGE_HANDLERS__;

// Singleton window message listener
function initWindowMessageListener(): void {
  if (window.__SNOWFLAKE_WINDOW_LISTENER_INITIALIZED__) return;
  window.__SNOWFLAKE_WINDOW_LISTENER_INITIALIZED__ = true;

  // Single global UUID deduplication set
  const processedUuids = new Set<string>();

  const handleWindowMessage = (event: MessageEvent<unknown>): void => {
    const result = ExtensionMessageSchema.safeParse(event.data);

    if (!result.success) {
      // Log validation failures to help debug schema mismatches
      if (
        typeof event.data === 'object' &&
        event.data !== null &&
        'type' in event.data &&
        typeof event.data.type === 'string'
      ) {
        // Log validation failures for debugging
        if (event.data.type.startsWith('conversation:')) {
          console.error(
            '[Snowflake] Conversation message validation failed:',
            event.data.type,
            result.error.issues
          );
        } else if (event.data.type.startsWith('agent:')) {
          console.warn(
            '[Snowflake] Invalid agent message dropped:',
            event.data.type,
            result.error.issues
          );
        }
      }
      return; // Invalid message, ignore
    }

    // Deduplicate messages by UUID (globally, once)
    const uuid = 'uuid' in result.data ? result.data.uuid : undefined;
    if (uuid) {
      if (processedUuids.has(uuid)) {
        return; // Already processed this message
      }
      processedUuids.add(uuid);
      // Limit set size to prevent memory leak
      if (processedUuids.size > 1000) {
        const iterator = processedUuids.values();
        for (let i = 0; i < 500; i++) {
          const value = iterator.next().value;
          if (value) processedUuids.delete(value);
        }
      }
    }

    // Dispatch to all registered handlers
    for (const handler of messageHandlers) {
      handler(result.data);
    }
  };

  window.addEventListener('message', handleWindowMessage);

  // Store removal function for HMR cleanup
  window.__SNOWFLAKE_REMOVE_WINDOW_LISTENER__ = (): void => {
    window.removeEventListener('message', handleWindowMessage);
  };

  console.warn('[Snowflake] Singleton window message listener initialized');
}

/** Track created sessions to ensure we create before sending */
const createdSessions = new Set<string>();

/** Ensure a session exists before sending messages */
async function ensureSession(sessionId: string): Promise<void> {
  if (createdSessions.has(sessionId)) {
    return;
  }

  // Get current workspace for session config
  const cwd = await getWorkspacePath();

  // Build config with optional cwd
  // Start in default mode (requires permission approval for each tool)
  const config: SessionConfig = {
    model: 'sonnet',
    thinkingEnabled: false,
    acceptEnabled: false,
    planEnabled: false,
  };
  if (cwd) {
    config.cwd = cwd;
  }

  await agentCreateSession(sessionId, config);

  createdSessions.add(sessionId);
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
        if (!storedPath) {
          // No workspace path set - try to get home directory
          try {
            const { homeDir } = await import('@tauri-apps/api/path');
            targetPath = await homeDir();
          } catch {
            // Fallback to root if home dir fails
            targetPath = '/';
          }
        } else {
          targetPath = storedPath;
        }
      }

      // Update UI store with workspace name (for header display)
      useUIStore.getState().setWorkspace(targetPath);

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
        isSymlink: entry.isSymlink,
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
          name: info.shell, // Use actual shell name from backend (e.g., "zsh")
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

  // Handle conversation creation
  if (message.type === 'conversation:create') {
    try {
      const sessionId = crypto.randomUUID();
      const title = message.title ?? 'New Conversation';
      const workspacePath = message.workspace_path;
      await conversationCreate(sessionId, title, workspacePath);
      window.postMessage(
        {
          type: 'conversation:created',
          uuid: crypto.randomUUID(),
          session_id: sessionId,
          title,
          workspace_path: workspacePath,
        },
        '*'
      );
    } catch (err: unknown) {
      console.error('[Snowflake] Conversation create error:', err);
      // Still emit created event so UI can proceed (will use localStorage fallback)
      const sessionId = crypto.randomUUID();
      window.postMessage(
        {
          type: 'conversation:created',
          uuid: crypto.randomUUID(),
          session_id: sessionId,
          title: message.title ?? 'New Conversation',
          workspace_path: message.workspace_path,
        },
        '*'
      );
    }
    return;
  }

  // Handle conversation list request
  if (message.type === 'conversation:list') {
    try {
      const workspacePath = message.workspace_path;
      const conversations = await conversationList(workspacePath);
      window.postMessage(
        {
          type: 'conversation:list',
          uuid: crypto.randomUUID(),
          conversations: conversations.map((c) => ({
            session_id: c.sessionId,
            title: c.title,
            updated_at: c.updatedAt,
            message_count: c.messageCount,
            workspace_path: c.workspacePath,
          })),
        },
        '*'
      );
    } catch (err: unknown) {
      console.error('[Snowflake] Conversation list error:', err);
      // Return empty list on error (localStorage will still have data)
      window.postMessage(
        {
          type: 'conversation:list',
          uuid: crypto.randomUUID(),
          conversations: [],
        },
        '*'
      );
    }
    return;
  }

  // Handle conversation load request
  if (message.type === 'conversation:load') {
    try {
      const conv = await conversationLoad(message.session_id);
      if (conv) {
        window.postMessage(
          {
            type: 'conversation:loaded',
            uuid: crypto.randomUUID(),
            session_id: conv.sessionId,
            title: conv.title,
            messages: conv.messages.map((m) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              timestamp: m.createdAt, // Schema expects 'timestamp', not 'created_at'
            })),
          },
          '*'
        );
      } else {
        // Conversation not found in backend - return empty
        window.postMessage(
          {
            type: 'conversation:loaded',
            uuid: crypto.randomUUID(),
            session_id: message.session_id,
            title: 'Conversation',
            messages: [],
          },
          '*'
        );
      }
    } catch (err: unknown) {
      console.error('Conversation load error:', err);
      window.postMessage(
        {
          type: 'conversation:loaded',
          uuid: crypto.randomUUID(),
          session_id: message.session_id,
          title: 'Conversation',
          messages: [],
        },
        '*'
      );
    }
    return;
  }

  // Handle conversation delete request
  if (message.type === 'conversation:delete') {
    try {
      await conversationDelete(message.session_id);
      window.postMessage(
        {
          type: 'conversation:deleted',
          uuid: crypto.randomUUID(),
          session_id: message.session_id,
        },
        '*'
      );
    } catch (err: unknown) {
      console.error('[Snowflake] Conversation delete error:', err);
    }
    return;
  }

  // Handle conversation title update
  if (message.type === 'conversation:updateTitle') {
    try {
      await conversationUpdateTitle(message.session_id, message.title);
    } catch (err: unknown) {
      console.error('[Snowflake] Conversation title update error:', err);
    }
    return;
  }

  // Handle conversation rewind request (fork)
  if (message.type === 'conversation:rewind') {
    try {
      const newSessionId = crypto.randomUUID();
      const forked = await conversationFork(message.session_id, newSessionId, message.message_id);
      if (forked) {
        window.postMessage(
          {
            type: 'conversation:rewound',
            uuid: crypto.randomUUID(),
            session_id: message.session_id,
            new_session_id: forked.sessionId,
            rewind_to_message_id: message.message_id,
            messages: forked.messages.map((m) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              thinking: m.thinking,
              created_at: m.createdAt,
            })),
          },
          '*'
        );
      } else {
        // Original not found - just create empty fork
        window.postMessage(
          {
            type: 'conversation:rewound',
            uuid: crypto.randomUUID(),
            session_id: message.session_id,
            new_session_id: newSessionId,
            rewind_to_message_id: message.message_id,
            messages: [],
          },
          '*'
        );
      }
    } catch (err: unknown) {
      console.error('[Snowflake] Conversation rewind error:', err);
      const newSessionId = crypto.randomUUID();
      window.postMessage(
        {
          type: 'conversation:rewound',
          uuid: crypto.randomUUID(),
          session_id: message.session_id,
          new_session_id: newSessionId,
          rewind_to_message_id: message.message_id,
          messages: [],
        },
        '*'
      );
    }
    return;
  }

  // Handle file list request (for file search/picker)
  if (message.type === 'file:list:request') {
    try {
      const storedPath = await getWorkspacePath();
      let workspacePath: string;
      if (!storedPath) {
        // No workspace path set - try to get home directory
        try {
          const { homeDir } = await import('@tauri-apps/api/path');
          workspacePath = await homeDir();
        } catch {
          // Fallback to root if home dir fails
          workspacePath = '/';
        }
      } else {
        workspacePath = storedPath;
      }

      // Get all files recursively (flatten the tree)
      // For now, just list the root directory files
      const entries = await listDirectory(workspacePath, false);
      const files = entries
        .filter((entry: FileEntry) => !entry.isDir)
        .map((entry: FileEntry) => ({
          name: entry.name,
          path: entry.path,
        }));

      window.postMessage(
        {
          type: 'file:list:response',
          uuid: crypto.randomUUID(),
          request_uuid: message.uuid,
          files,
        },
        '*'
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to list files';
      console.error('[Snowflake] File list error:', errorMessage);
      window.postMessage(
        {
          type: 'file:list:response',
          uuid: crypto.randomUUID(),
          request_uuid: message.uuid,
          files: [],
        },
        '*'
      );
    }
    return;
  }

  // ═══════════════════════════════════════════════════════════════
  // Agent SDK Message Handlers
  // ═══════════════════════════════════════════════════════════════

  // Handle sending a message to the agent
  if (message.type === 'message:send') {
    try {
      // Ensure session exists
      await ensureSession(message.session_id);

      // Convert context images to attachments if present
      const attachments: AttachmentContentBlock[] = [];

      if (message.context?.images) {
        for (const img of message.context.images) {
          attachments.push({
            type: 'image',
            source: {
              type: 'base64',
              mediaType: img.mimeType,
              data: img.data,
            },
            title: img.name,
          });
        }
      }

      // Send message to agent
      await agentSendMessage(
        message.session_id,
        message.content,
        attachments.length > 0 ? attachments : undefined
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send message';
      console.error('[Snowflake] Agent send message error:', errorMessage);
      window.postMessage(
        {
          type: 'agent:error',
          uuid: crypto.randomUUID(),
          session_id: message.session_id,
          message_id: crypto.randomUUID(),
          error: errorMessage,
        },
        '*'
      );
    }
    return;
  }

  // Handle stopping the agent
  if (message.type === 'agent:stop') {
    try {
      await agentInterrupt(message.session_id);
    } catch (err: unknown) {
      console.error('[Snowflake] Agent interrupt error:', err);
    }
    return;
  }

  // Handle permission response
  if (message.type === 'permission:response') {
    try {
      await agentRespondPermission(message.request_id, message.decision, message.always ?? false);
    } catch (err: unknown) {
      console.error('[Snowflake] Permission response error:', err);
    }
    return;
  }

  // Handle thinking mode change
  if (message.type === 'thinking:set') {
    try {
      const enabled = message.mode !== 'off';
      const maxTokens =
        message.mode === 'think'
          ? 4096
          : message.mode === 'hard'
            ? 10240
            : message.mode === 'ultra'
              ? 32768
              : undefined;
      await agentSetThinkingMode(message.session_id, enabled, maxTokens);
    } catch (err: unknown) {
      console.error('[Snowflake] Set thinking mode error:', err);
    }
    return;
  }

  // Handle model change
  if (message.type === 'model:set') {
    try {
      await agentSetModel(message.session_id, message.model);
    } catch (err: unknown) {
      console.error('[Snowflake] Set model error:', err);
    }
    return;
  }

  // Handle input mode change
  if (message.type === 'inputMode:set') {
    try {
      if (message.mode === 'plan') {
        await agentSetPlanMode(message.session_id, true);
      } else if (message.mode === 'accept') {
        await agentSetAcceptMode(message.session_id, true);
      } else {
        // Default mode - disable both plan and accept
        await agentSetPlanMode(message.session_id, false);
        await agentSetAcceptMode(message.session_id, false);
      }
    } catch (err: unknown) {
      console.error('[Snowflake] Set input mode error:', err);
    }
    return;
  }

  // ═══════════════════════════════════════════════════════════════
  // Subagent Management Handlers
  // ═══════════════════════════════════════════════════════════════

  // Handle listing subagents
  if (message.type === 'subagents:list') {
    try {
      const workspacePath = (await getWorkspacePath()) ?? '/';
      const agents = await listAgents(workspacePath);
      window.postMessage(
        {
          type: 'subagents:list:response',
          uuid: crypto.randomUUID(),
          request_uuid: message.uuid,
          agents,
        },
        '*'
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to list subagents';
      console.error('[Snowflake] List subagents error:', errorMessage);
      window.postMessage(
        {
          type: 'subagents:error',
          uuid: crypto.randomUUID(),
          request_uuid: message.uuid,
          error: errorMessage,
        },
        '*'
      );
    }
    return;
  }

  // Handle creating a subagent
  if (message.type === 'subagents:create') {
    try {
      const workspacePath = (await getWorkspacePath()) ?? '/';
      // Filter undefined values to match exactOptionalPropertyTypes
      const agentInput = {
        name: message.agent.name,
        description: message.agent.description,
        prompt: message.agent.prompt,
        ...(message.agent.tools && { tools: message.agent.tools }),
        ...(message.agent.disallowedTools && { disallowedTools: message.agent.disallowedTools }),
        ...(message.agent.model && { model: message.agent.model }),
      };
      const agent = await createAgent(workspacePath, agentInput);
      window.postMessage(
        {
          type: 'subagents:created',
          uuid: crypto.randomUUID(),
          request_uuid: message.uuid,
          agent,
        },
        '*'
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create subagent';
      console.error('[Snowflake] Create subagent error:', errorMessage);
      window.postMessage(
        {
          type: 'subagents:error',
          uuid: crypto.randomUUID(),
          request_uuid: message.uuid,
          error: errorMessage,
        },
        '*'
      );
    }
    return;
  }

  // Handle updating a subagent
  if (message.type === 'subagents:update') {
    try {
      const workspacePath = (await getWorkspacePath()) ?? '/';
      // Filter undefined values to match exactOptionalPropertyTypes
      const agentInput = {
        name: message.agent.name,
        description: message.agent.description,
        prompt: message.agent.prompt,
        ...(message.agent.tools && { tools: message.agent.tools }),
        ...(message.agent.disallowedTools && { disallowedTools: message.agent.disallowedTools }),
        ...(message.agent.model && { model: message.agent.model }),
      };
      const agent = await updateAgent(workspacePath, message.originalName, agentInput);
      window.postMessage(
        {
          type: 'subagents:updated',
          uuid: crypto.randomUUID(),
          request_uuid: message.uuid,
          agent,
        },
        '*'
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update subagent';
      console.error('[Snowflake] Update subagent error:', errorMessage);
      window.postMessage(
        {
          type: 'subagents:error',
          uuid: crypto.randomUUID(),
          request_uuid: message.uuid,
          error: errorMessage,
        },
        '*'
      );
    }
    return;
  }

  // Handle deleting a subagent
  if (message.type === 'subagents:delete') {
    try {
      const workspacePath = (await getWorkspacePath()) ?? '/';
      await deleteAgent(workspacePath, message.name);
      window.postMessage(
        {
          type: 'subagents:deleted',
          uuid: crypto.randomUUID(),
          request_uuid: message.uuid,
          name: message.name,
        },
        '*'
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete subagent';
      console.error('[Snowflake] Delete subagent error:', errorMessage);
      window.postMessage(
        {
          type: 'subagents:error',
          uuid: crypto.randomUUID(),
          request_uuid: message.uuid,
          error: errorMessage,
        },
        '*'
      );
    }
    return;
  }

  // Handle generating a subagent from description
  if (message.type === 'subagents:generate') {
    try {
      const agent = await generateAgentDefinition(message.description);
      window.postMessage(
        {
          type: 'subagents:generated',
          uuid: crypto.randomUUID(),
          request_uuid: message.uuid,
          agent,
        },
        '*'
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate subagent';
      console.error('[Snowflake] Generate subagent error:', errorMessage);
      window.postMessage(
        {
          type: 'subagents:error',
          uuid: crypto.randomUUID(),
          request_uuid: message.uuid,
          error: errorMessage,
        },
        '*'
      );
    }
    return;
  }

  // ═══════════════════════════════════════════════════════════════
  // Command (Slash Command) Management Handlers
  // ═══════════════════════════════════════════════════════════════

  // Handle listing commands
  if (message.type === 'commands:list') {
    try {
      const workspacePath = (await getWorkspacePath()) ?? '/';
      const commands = await listCommands(workspacePath);
      window.postMessage(
        {
          type: 'commands:list:response',
          uuid: crypto.randomUUID(),
          request_uuid: message.uuid,
          commands,
        },
        '*'
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to list commands';
      console.error('[Snowflake] List commands error:', errorMessage);
      window.postMessage(
        {
          type: 'commands:error',
          uuid: crypto.randomUUID(),
          request_uuid: message.uuid,
          error: errorMessage,
        },
        '*'
      );
    }
    return;
  }

  // Handle creating a command
  if (message.type === 'commands:create') {
    try {
      const workspacePath = (await getWorkspacePath()) ?? '/';
      // Filter undefined values to match exactOptionalPropertyTypes
      const commandInput = {
        name: message.command.name,
        content: message.command.content,
        scope: message.command.scope,
        ...(message.command.description && { description: message.command.description }),
        ...(message.command.allowedTools && { allowedTools: message.command.allowedTools }),
        ...(message.command.argumentHint && { argumentHint: message.command.argumentHint }),
        ...(message.command.model && { model: message.command.model }),
        ...(message.command.readonly !== undefined && { readonly: message.command.readonly }),
      };
      const command = await createCommand(workspacePath, commandInput);
      window.postMessage(
        {
          type: 'commands:created',
          uuid: crypto.randomUUID(),
          request_uuid: message.uuid,
          command,
        },
        '*'
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create command';
      console.error('[Snowflake] Create command error:', errorMessage);
      window.postMessage(
        {
          type: 'commands:error',
          uuid: crypto.randomUUID(),
          request_uuid: message.uuid,
          error: errorMessage,
        },
        '*'
      );
    }
    return;
  }

  // Handle updating a command
  if (message.type === 'commands:update') {
    try {
      const workspacePath = (await getWorkspacePath()) ?? '/';
      // Filter undefined values to match exactOptionalPropertyTypes
      const commandInput = {
        name: message.command.name,
        content: message.command.content,
        scope: message.command.scope,
        ...(message.command.description && { description: message.command.description }),
        ...(message.command.allowedTools && { allowedTools: message.command.allowedTools }),
        ...(message.command.argumentHint && { argumentHint: message.command.argumentHint }),
        ...(message.command.model && { model: message.command.model }),
        ...(message.command.readonly !== undefined && { readonly: message.command.readonly }),
      };
      const command = await updateCommand(workspacePath, message.originalName, commandInput);
      window.postMessage(
        {
          type: 'commands:updated',
          uuid: crypto.randomUUID(),
          request_uuid: message.uuid,
          command,
        },
        '*'
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update command';
      console.error('[Snowflake] Update command error:', errorMessage);
      window.postMessage(
        {
          type: 'commands:error',
          uuid: crypto.randomUUID(),
          request_uuid: message.uuid,
          error: errorMessage,
        },
        '*'
      );
    }
    return;
  }

  // Handle deleting a command
  if (message.type === 'commands:delete') {
    try {
      const workspacePath = (await getWorkspacePath()) ?? '/';
      await deleteCommand(workspacePath, message.name, message.scope);
      window.postMessage(
        {
          type: 'commands:deleted',
          uuid: crypto.randomUUID(),
          request_uuid: message.uuid,
          name: message.name,
        },
        '*'
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete command';
      console.error('[Snowflake] Delete command error:', errorMessage);
      window.postMessage(
        {
          type: 'commands:error',
          uuid: crypto.randomUUID(),
          request_uuid: message.uuid,
          error: errorMessage,
        },
        '*'
      );
    }
    return;
  }

  // Handle generating a command from description
  if (message.type === 'commands:generate') {
    try {
      const command = await generateCommandDefinition(message.description);
      window.postMessage(
        {
          type: 'commands:generated',
          uuid: crypto.randomUUID(),
          request_uuid: message.uuid,
          command,
        },
        '*'
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate command';
      console.error('[Snowflake] Generate command error:', errorMessage);
      window.postMessage(
        {
          type: 'commands:error',
          uuid: crypto.randomUUID(),
          request_uuid: message.uuid,
          error: errorMessage,
        },
        '*'
      );
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

  // Initialize connection state correctly from the start (no useEffect needed)
  // This avoids state updates during commit phase which can cause infinite re-renders
  const [isConnected] = useState(() => isTauriEnvironment());
  const [isMockMode] = useState(() => !isTauriEnvironment());
  const handlerRef = useRef(onMessage);

  // Use refs for connection state so postMessage callback stays stable
  const isConnectedRef = useRef(isConnected);
  const isMockModeRef = useRef(isMockMode);

  handlerRef.current = onMessage;
  isConnectedRef.current = isConnected;
  isMockModeRef.current = isMockMode;

  // Log connection status once on mount
  useEffect(() => {
    if (debug) {
      if (isConnected && !isMockMode) {
        console.warn('[Snowflake] Connected to Tauri backend');
      } else {
        console.warn('[Snowflake] Mock mode - no Tauri backend');
      }
    }
  }, [debug, isConnected, isMockMode]);

  // Register/unregister handler with singleton message listener
  useEffect(() => {
    // Initialize singleton window listener (only runs once globally)
    initWindowMessageListener();

    // Create a stable handler wrapper that uses the ref
    const handler = (message: ExtensionMessage): void => {
      if (debug) {
        console.warn('[Snowflake] Received:', message.type);
      }
      handlerRef.current?.(message);
    };

    // Register this hook's handler
    messageHandlers.add(handler);

    return (): void => {
      // Unregister this hook's handler
      messageHandlers.delete(handler);
    };
  }, [debug]);

  // NOTE: Terminal and agent listeners are now initialized by TauriProvider
  // This ensures proper React lifecycle management and HMR support

  // Send message with validation
  // Uses refs for connection state so this callback reference stays stable
  const postMessage = useCallback(
    (message: WebviewMessage): void => {
      const result = WebviewMessageSchema.safeParse(message);
      if (!result.success) {
        console.error('[Snowflake] Invalid outgoing message:', formatZodError(result.error));
        return;
      }

      if (debug) {
        console.warn('[Snowflake] Sending:', message.type);
      }

      // Use refs to avoid dependency on state (prevents infinite re-renders)
      if (isConnectedRef.current && !isMockModeRef.current) {
        // Handle message via Tauri commands
        handleTauriMessage(message).catch((err: unknown) => {
          console.error('[Snowflake] Tauri message error:', err);
        });
      } else if (isMockModeRef.current) {
        if (debug) console.warn('[Snowflake Mock]', message);
        handleMockMessage(message);
      }
    },
    [debug]
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
            name: 'zsh', // Use shell name, not session name
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
        case 'agent:plan_mode':
        case 'agent:accept_mode':
        case 'permission:request':
        case 'inputMode:changed':
        case 'thinking:changed':
        case 'model:changed':
        case 'terminal:output':
        case 'terminal:created':
        case 'conversation:created':
        case 'conversation:deleted':
        case 'conversation:loading':
        case 'conversation:loaded':
        case 'conversation:rewound':
          break;
      }
    },
    [sessionId, onChunk, onComplete, onError, onToolStart, onToolEnd]
  );

  useTauri({ onMessage: handleMessage });
}
