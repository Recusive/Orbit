import { formatConversationContext } from './use-tauri-context';
import { initFileWatcher } from './use-tauri-file-watcher';
import {
  ensureSession,
  consumeRewindContext,
  markSessionAsForked,
  setRewindContext,
} from './use-tauri-session';

import type { RewindContextMessage } from './types/tauri-types';
import type { AttachmentContentBlock, FileEntry } from '@/lib/api/backend';
import type { WebviewMessage } from '@/types/protocol';

import {
  listDirectory,
  readFile,
  getWorkspacePath,
  lspSetWorkspace,
  createTerminal,
  writeTerminal,
  resizeTerminal,
  closeTerminal,
  // Agent SDK operations
  agentSendMessage,
  agentInterrupt,
  agentRespondPermission,
  agentSetThinkingMode,
  agentSetModel,
  agentSetPlanMode,
  agentSetAcceptMode,
  agentRewindFiles,
  agentGetSdkSessionId,
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
} from '@/lib/api/backend';
import { useCheckpointStore } from '@/stores/agent/checkpoint-store';
import { useTerminalStore } from '@/stores/terminal/terminal-store';
import { useUIStore } from '@/stores/ui/ui-store';

// ═══════════════════════════════════════════════════════════════
// Tauri Message Handler
// ═══════════════════════════════════════════════════════════════

export async function handleTauriMessage(message: WebviewMessage): Promise<void> {
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

      // Only update UI store workspace on initial load (when no specific path was requested)
      // This prevents subfolder navigation from overwriting the root workspace
      if (message.path === undefined || message.path === '') {
        useUIStore.getState().setWorkspace(targetPath);

        // Set workspace for LSP - this initializes language servers for the workspace
        lspSetWorkspace(targetPath).catch((err: unknown) => {
          console.warn('[Orbit] Failed to set LSP workspace:', err);
        });

        // Start watching the workspace for file changes (for auto-refresh)
        initFileWatcher(targetPath).catch((err: unknown) => {
          console.warn('[Orbit] Failed to initialize file watcher:', err);
        });
      }

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

      // Check if session has an initial command to execute (e.g., SSH)
      const session = useTerminalStore.getState().sessions.find((s) => s.id === message.session_id);
      if (session?.initialCommand) {
        // Small delay to ensure terminal is ready
        await new Promise((resolve) => setTimeout(resolve, 150));
        await writeTerminal(info.id, `${session.initialCommand}\n`);
        console.warn('[Orbit] Executed initial command:', session.initialCommand);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create terminal';
      console.error('[Orbit] Terminal creation error:', errorMessage);
    }
    return;
  }

  // Handle terminal write
  if (message.type === 'terminal:write') {
    try {
      await writeTerminal(message.terminal_id, message.data);
    } catch (err: unknown) {
      console.error('[Orbit] Terminal write error:', err);
    }
    return;
  }

  // Handle terminal resize
  if (message.type === 'terminal:resize') {
    try {
      await resizeTerminal(message.terminal_id, message.cols, message.rows);
    } catch (err: unknown) {
      console.error('[Orbit] Terminal resize error:', err);
    }
    return;
  }

  // Handle terminal close
  if (message.type === 'terminal:close') {
    try {
      await closeTerminal(message.terminal_id);
    } catch (err: unknown) {
      console.error('[Orbit] Terminal close error:', err);
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
      console.error('[Orbit] Conversation create error:', err);
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
      console.error('[Orbit] Conversation list error:', err);
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
              createdAt: m.createdAt,
              // Include all optional fields for backwards compatibility and usage tracking
              ...(m.thinking ? { thinking: m.thinking } : {}),
              ...(m.toolUses && m.toolUses.length > 0 ? { toolUses: m.toolUses } : {}),
              ...(m.usage ? { usage: m.usage } : {}),
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
      console.error('[Orbit] Conversation delete error:', err);
    }
    return;
  }

  // Handle conversation title update
  if (message.type === 'conversation:updateTitle') {
    try {
      await conversationUpdateTitle(message.session_id, message.title);
    } catch (err: unknown) {
      console.error('[Orbit] Conversation title update error:', err);
    }
    return;
  }

  // Handle conversation rewind request (fork)
  // ⚠️  TESTED: This rewind flow is covered by integration tests.
  //     If you modify this, run: cd agent-bridge && bun test
  //     Test file: src/__tests__/combined-rewind.test.ts
  if (message.type === 'conversation:rewind') {
    await handleConversationRewind(message);
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
      console.error('[Orbit] File list error:', errorMessage);
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
    await handleMessageSend(message);
    return;
  }

  // Handle stopping the agent
  if (message.type === 'agent:stop') {
    try {
      await agentInterrupt(message.session_id);
    } catch (err: unknown) {
      console.error('[Orbit] Agent interrupt error:', err);
    }
    return;
  }

  // Handle permission response
  if (message.type === 'permission:response') {
    try {
      await agentRespondPermission(message.request_id, message.decision, message.always ?? false);
    } catch (err: unknown) {
      console.error('[Orbit] Permission response error:', err);
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
      console.error('[Orbit] Set thinking mode error:', err);
    }
    return;
  }

  // Handle model change
  if (message.type === 'model:set') {
    try {
      await agentSetModel(message.session_id, message.model);
    } catch (err: unknown) {
      console.error('[Orbit] Set model error:', err);
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
      console.error('[Orbit] Set input mode error:', err);
    }
    return;
  }

  // ═══════════════════════════════════════════════════════════════
  // Subagent Management Handlers
  // ═══════════════════════════════════════════════════════════════

  if (message.type === 'subagents:list') {
    await handleSubagentsList(message);
    return;
  }

  if (message.type === 'subagents:create') {
    await handleSubagentsCreate(message);
    return;
  }

  if (message.type === 'subagents:update') {
    await handleSubagentsUpdate(message);
    return;
  }

  if (message.type === 'subagents:delete') {
    await handleSubagentsDelete(message);
    return;
  }

  if (message.type === 'subagents:generate') {
    await handleSubagentsGenerate(message);
    return;
  }

  // ═══════════════════════════════════════════════════════════════
  // Command (Slash Command) Management Handlers
  // ═══════════════════════════════════════════════════════════════

  if (message.type === 'commands:list') {
    await handleCommandsList(message);
    return;
  }

  if (message.type === 'commands:create') {
    await handleCommandsCreate(message);
    return;
  }

  if (message.type === 'commands:update') {
    await handleCommandsUpdate(message);
    return;
  }

  if (message.type === 'commands:delete') {
    await handleCommandsDelete(message);
    return;
  }

  if (message.type === 'commands:generate') {
    await handleCommandsGenerate(message);
    return;
  }

  // Other message types are handled elsewhere or not applicable
}

// ═══════════════════════════════════════════════════════════════
// Handler Helper Functions
// ═══════════════════════════════════════════════════════════════

async function handleConversationRewind(
  message: Extract<WebviewMessage, { type: 'conversation:rewind' }>
): Promise<void> {
  try {
    // We receive TWO message IDs:
    // - message_id: The clicked message (for UI fork - include up to this message)
    // - user_message_id: The user message (for checkpoint lookup - checkpoints stored by user msg)
    const { message_id, user_message_id } = message;

    // Step 1: Get the checkpoint using the USER message ID
    // (checkpoints are stored under user message IDs, not assistant IDs)
    const checkpointStore = useCheckpointStore.getState();
    const rewindCheckpoints = checkpointStore.getRewindCheckpoints(
      message.session_id,
      user_message_id
    );

    // Debug: Log checkpoint state
    const sessionCheckpoints = checkpointStore.getSessionCheckpoints(message.session_id);
    console.warn('[Orbit] Rewind requested:', {
      session_id: message.session_id,
      message_id,
      user_message_id,
      rewindCheckpoints,
      sessionCheckpoints,
    });

    // Step 2: Get SDK session ID BEFORE forking so we can resume from it
    let sdkSessionId: string | null = null;
    try {
      sdkSessionId = await agentGetSdkSessionId(message.session_id);
      console.warn('[Orbit] Got SDK session ID for resume:', sdkSessionId);
    } catch (sdkErr) {
      console.error('[Orbit] Could not get SDK session ID:', sdkErr);
    }

    // Step 3: Rewind files to the turn END checkpoint (file state after this message completed)
    // This restores all Write/Edit/NotebookEdit changes made after this point
    if (rewindCheckpoints?.rewindFiles) {
      try {
        console.warn('[Orbit] Calling agentRewindFiles with turnEnd checkpoint...');
        await agentRewindFiles(message.session_id, rewindCheckpoints.rewindFiles);
        console.warn('[Orbit] Files rewound to checkpoint:', rewindCheckpoints.rewindFiles);
      } catch (rewindErr) {
        // Log but continue with conversation fork even if file rewind fails
        console.error('[Orbit] File rewind failed:', rewindErr);
      }
    } else {
      console.warn('[Orbit] No checkpoints found for session, skipping file rewind');
    }

    // Step 4: Fork the conversation to this point
    const newSessionId = crypto.randomUUID();

    // Step 5: Fork the conversation using the CLICKED message ID
    // This ensures we include up to and including the clicked message (user OR assistant)
    const forked = await conversationFork(message.session_id, newSessionId, message_id);

    // Step 6: Store rewind context and mark session as forked
    // NOTE: We DON'T use SDK's resume for message history anymore.
    // The SDK's resume loads ALL messages which breaks rewind.
    // Instead, we store the truncated messages and prepend them to the first message.
    if (forked && forked.messages.length > 0) {
      // Store the truncated messages as context for the first message
      const contextMessages: RewindContextMessage[] = forked.messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));
      setRewindContext(forked.sessionId, contextMessages);
      console.warn('[Orbit] Stored rewind context for forked session:', {
        sessionId: forked.sessionId,
        messageCount: contextMessages.length,
      });
    }

    // Mark session as forked (for file checkpoint tracking, NOT for SDK resume)
    if (sdkSessionId) {
      markSessionAsForked(newSessionId, sdkSessionId);
      console.warn('[Orbit] Marked forked session (context-based, no SDK resume):', {
        newSessionId,
        sdkSessionId,
      });
    }

    if (forked) {
      window.postMessage(
        {
          type: 'conversation:rewound',
          uuid: crypto.randomUUID(),
          session_id: message.session_id,
          new_session_id: forked.sessionId,
          rewind_to_message_id: message_id,
          messages: forked.messages.map((m) => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: m.content,
            timestamp: m.createdAt,
            toolUses: m.toolUses,
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
          rewind_to_message_id: message_id,
          messages: [],
        },
        '*'
      );
    }
  } catch (err: unknown) {
    console.error('[Orbit] Conversation rewind error:', err);
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
}

async function handleMessageSend(
  message: Extract<WebviewMessage, { type: 'message:send' }>
): Promise<void> {
  try {
    // Ensure session exists
    await ensureSession(message.session_id);

    // Track this user message ID for checkpoint association
    // The checkpoint that arrives will be stored against this user message ID
    useCheckpointStore.getState().onUserMessageSent(message.session_id, message.uuid);

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

    // Check if this session has rewind context (from a rewind fork)
    // If so, prepend the conversation history to the first message
    // This is the key fix: we pass truncated history as context, NOT via SDK resume
    let contentToSend = message.content;
    const rewindContext = consumeRewindContext(message.session_id);
    if (rewindContext && rewindContext.length > 0) {
      const contextPrefix = formatConversationContext(rewindContext);
      contentToSend = contextPrefix + message.content;
      console.warn('[Orbit] Prepended rewind context to message:', {
        sessionId: message.session_id,
        contextMessageCount: rewindContext.length,
        originalLength: message.content.length,
        newLength: contentToSend.length,
      });
    }

    // Send message to agent
    await agentSendMessage(
      message.session_id,
      contentToSend,
      attachments.length > 0 ? attachments : undefined
    );
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to send message';
    console.error('[Orbit] Agent send message error:', errorMessage);
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
}

// ═══════════════════════════════════════════════════════════════
// Subagent Handlers
// ═══════════════════════════════════════════════════════════════

async function handleSubagentsList(
  message: Extract<WebviewMessage, { type: 'subagents:list' }>
): Promise<void> {
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
    console.error('[Orbit] List subagents error:', errorMessage);
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
}

async function handleSubagentsCreate(
  message: Extract<WebviewMessage, { type: 'subagents:create' }>
): Promise<void> {
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
    console.error('[Orbit] Create subagent error:', errorMessage);
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
}

async function handleSubagentsUpdate(
  message: Extract<WebviewMessage, { type: 'subagents:update' }>
): Promise<void> {
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
    console.error('[Orbit] Update subagent error:', errorMessage);
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
}

async function handleSubagentsDelete(
  message: Extract<WebviewMessage, { type: 'subagents:delete' }>
): Promise<void> {
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
    console.error('[Orbit] Delete subagent error:', errorMessage);
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
}

async function handleSubagentsGenerate(
  message: Extract<WebviewMessage, { type: 'subagents:generate' }>
): Promise<void> {
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
    console.error('[Orbit] Generate subagent error:', errorMessage);
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
}

// ═══════════════════════════════════════════════════════════════
// Command Handlers
// ═══════════════════════════════════════════════════════════════

async function handleCommandsList(
  message: Extract<WebviewMessage, { type: 'commands:list' }>
): Promise<void> {
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
    console.error('[Orbit] List commands error:', errorMessage);
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
}

async function handleCommandsCreate(
  message: Extract<WebviewMessage, { type: 'commands:create' }>
): Promise<void> {
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
    console.error('[Orbit] Create command error:', errorMessage);
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
}

async function handleCommandsUpdate(
  message: Extract<WebviewMessage, { type: 'commands:update' }>
): Promise<void> {
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
    console.error('[Orbit] Update command error:', errorMessage);
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
}

async function handleCommandsDelete(
  message: Extract<WebviewMessage, { type: 'commands:delete' }>
): Promise<void> {
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
    console.error('[Orbit] Delete command error:', errorMessage);
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
}

async function handleCommandsGenerate(
  message: Extract<WebviewMessage, { type: 'commands:generate' }>
): Promise<void> {
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
    console.error('[Orbit] Generate command error:', errorMessage);
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
}
