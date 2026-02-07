import { createLogger } from '@orbit/common/lib';

import type { ConversationMessageDto } from '@/lib/api/conversations';
import type { WebviewMessage } from '@/types/protocol';

import {
  agentRewindFiles,
  agentForkSessionAt,
  conversationList,
  conversationLoad,
  conversationDelete,
  conversationUpdateTitle,
} from '@/lib/api';
import { useCheckpointStore } from '@/stores/agent/checkpoint-store';

const logger = createLogger('ConversationHandlers');

export function handleConversationCreate(
  message: Extract<WebviewMessage, { type: 'conversation:create' }>
): void {
  // Generate a temp session ID for the frontend. The SDK will write the JSONL file
  // when the first message is sent, using its own session ID. The system:init handler
  // in message-handler.ts remaps the frontend to the SDK ID at that point.
  const sessionId = crypto.randomUUID();
  const title = message.title ?? 'New Conversation';
  window.postMessage(
    {
      type: 'conversation:created',
      uuid: crypto.randomUUID(),
      session_id: sessionId,
      title,
      workspace_path: message.workspace_path,
      worktree_path: message.worktree_path,
    },
    '*'
  );
}

export async function handleConversationList(
  message: Extract<WebviewMessage, { type: 'conversation:list' }>
): Promise<void> {
  try {
    const workspacePath = message.workspace_path;
    const worktreePath = message.worktree_path;
    const conversations = await conversationList(workspacePath, worktreePath);
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
          worktree_path: c.worktreePath,
        })),
      },
      '*'
    );
  } catch (err: unknown) {
    logger.error('Conversation list error', err);
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
}

export async function handleConversationLoad(
  message: Extract<WebviewMessage, { type: 'conversation:load' }>
): Promise<void> {
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
          // Authoritative session usage from SDK result event (via .usage.json sidecar)
          ...(conv.sessionUsage ? { session_usage: conv.sessionUsage } : {}),
        },
        '*'
      );
    } else {
      // Conversation not found on disk — likely a cache-only session
      // (created via "New Session" but SDK hasn't written the JSONL file yet).
      // Return empty messages but preserve whatever title the sidebar already has.
      logger.debug('Conversation not found on disk (cache-only?)', {
        sessionId: message.session_id,
      });
      window.postMessage(
        {
          type: 'conversation:loaded',
          uuid: crypto.randomUUID(),
          session_id: message.session_id,
          title: 'Untitled',
          messages: [],
        },
        '*'
      );
    }
  } catch (err: unknown) {
    logger.error('Conversation load error', err);
    window.postMessage(
      {
        type: 'conversation:loaded',
        uuid: crypto.randomUUID(),
        session_id: message.session_id,
        title: 'Untitled',
        messages: [],
      },
      '*'
    );
  }
}

export async function handleConversationDelete(
  message: Extract<WebviewMessage, { type: 'conversation:delete' }>
): Promise<void> {
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
    logger.error('Conversation delete error', err);
  }
}

export async function handleConversationUpdateTitle(
  message: Extract<WebviewMessage, { type: 'conversation:updateTitle' }>
): Promise<void> {
  try {
    await conversationUpdateTitle(message.session_id, message.title);
  } catch (err: unknown) {
    logger.error('Conversation title update error', err);
  }
}

// TESTED: This rewind flow is covered by integration tests.
//     If you modify this, run: cd agent-bridge && bun test
//     Test file: src/__tests__/combined-rewind.test.ts
//
// =============================================================================
// SDK FORK-BASED REWIND (resumeSessionAt + forkSession)
// =============================================================================
//
// How this works:
// 1. User clicks "rewind to message X"
// 2. We rewind files to the checkpoint state (restores file changes)
// 3. We fork the session at message X using SDK's resumeSessionAt + forkSession
// 4. The SDK creates a NEW session with context ONLY up to message X
// 5. Claude genuinely doesn't see messages that came after the fork point
//
// This uses the SDK's built-in forking mechanism which is much cleaner than
// trying to manipulate parentUuid chains manually. The user message UUIDs
// captured via replay-user-messages are the exact checkpoints needed.
//
export async function handleConversationRewind(
  message: Extract<WebviewMessage, { type: 'conversation:rewind' }>
): Promise<void> {
  try {
    // We receive THREE pieces of information:
    // - message_id: The clicked message ID (for UI display - show up to this message)
    // - user_message_id: The user message ID (for checkpoint lookup - checkpoints stored by user msg)
    // - message_index: Position of clicked message in the UI (fallback when IDs don't match disk)
    //
    // The index fallback is needed because:
    // - Messages loaded from disk have SDK-generated UUIDs
    // - New messages sent this session have frontend-generated UUIDs
    // - On rewind, we load from disk (SDK IDs) but the clicked message might have a frontend ID
    const { message_id, user_message_id, session_id, message_index } = message;

    // Step 1: Get the checkpoint using the USER message ID
    // (checkpoints are stored under user message IDs, not assistant IDs)
    const checkpointStore = useCheckpointStore.getState();
    const rewindCheckpoints = checkpointStore.getRewindCheckpoints(session_id, user_message_id);

    // Debug: Log checkpoint state
    const sessionCheckpoints = checkpointStore.getSessionCheckpoints(session_id);
    logger.debug('Rewind requested (Claude Code-style, same session)', {
      session_id,
      message_id,
      user_message_id,
      rewindCheckpoints,
      sessionCheckpoints,
    });

    // Step 2: Rewind files to the turn END checkpoint (file state after this message completed)
    // This restores all Write/Edit/NotebookEdit changes made after this point
    if (rewindCheckpoints?.rewindFiles) {
      try {
        logger.debug('Calling agentRewindFiles with turnEnd checkpoint');
        await agentRewindFiles(session_id, rewindCheckpoints.rewindFiles);
        logger.debug('Files rewound to checkpoint', { checkpoint: rewindCheckpoints.rewindFiles });
      } catch (rewindErr) {
        // Log but continue with UI update even if file rewind fails
        logger.error('File rewind failed', rewindErr);
      }
    } else {
      logger.debug('No checkpoints found for session, skipping file rewind');
    }

    // Step 3: CRITICAL - Fork the session at the target message
    // Using SDK's resumeSessionAt + forkSession creates a new session with context
    // ONLY up to the specified message. Claude won't see messages that came after.
    // IMPORTANT: We must use the SDK checkpoint UUID (from replay-user-messages),
    // NOT the frontend message ID. The SDK only knows about its own checkpoint UUIDs.
    //
    // NOTE: The SDK fork is LAZY - it doesn't create the new session until you send a message.
    // agentForkSessionAt returns the OLD session ID because the new one isn't known yet.
    // The actual new session ID comes back in system:init when the first message is sent.
    // Step 4: Load conversation from disk FIRST to get the SDK message ID
    // We need the actual SDK-generated message ID for the fork (frontend IDs don't match JSONL)
    const conv = await conversationLoad(session_id);

    // Find the target message - need this before setting up the fork
    let targetMessage: ConversationMessageDto | undefined;
    let sdkMessageId: string | undefined;

    if (conv) {
      const messageMap = new Map(conv.messages.map((m) => [m.id, m]));

      // Try to find the clicked message by ID first
      targetMessage = messageMap.get(message_id);

      // Fallback: If ID matching fails (frontend ID vs SDK ID mismatch), use position
      // This happens when:
      // - User sends a message this session → frontend-generated UUID
      // - Clicks rewind → disk has SDK-generated UUID for same message
      // - ID lookup fails → use message_index to find by position
      if (!targetMessage && message_index >= 0 && message_index < conv.messages.length) {
        targetMessage = conv.messages[message_index];
        logger.debug('ID match failed, using position-based fallback', {
          message_id,
          message_index,
          fallbackMessageId: targetMessage?.id,
        });
      }

      // Use SDK message ID (from disk) for the fork, NOT the frontend ID
      sdkMessageId = targetMessage?.id;
    }

    // Step 5: Set up the SDK fork with the correct SDK message ID
    // IMPORTANT: We use sdkMessageId (the assistant response UUID), NOT the checkpoint UUID.
    // The checkpoint UUID is a USER message UUID from replay-user-messages, which would
    // truncate BEFORE the response. We need to truncate AFTER the response.
    // The agent-bridge will truncate the JSONL file at this message ID.
    if (sdkMessageId) {
      try {
        logger.debug('Forking session - truncating JSONL at message', {
          user_message_id,
          sdkMessageId,
          checkpointUuid: rewindCheckpoints?.resumeSessionAt,
        });
        await agentForkSessionAt(session_id, sdkMessageId);
        logger.debug('Session fork prepared - JSONL truncated at assistant response');

        // Track the pending conversation fork for later (when we know the actual new session ID)
        checkpointStore.setPendingConversationFork(session_id, sdkMessageId);
      } catch (forkErr) {
        // Log but continue - worst case, we show the UI update without SDK context change
        logger.error('Session fork failed', forkErr);
      }
    } else {
      logger.warn('No SDK message ID found for rewind target, cannot fork session', {
        user_message_id,
        message_id,
        message_index,
        session_id,
      });
    }

    // Step 6: Build the message list to display
    if (conv && targetMessage) {
      // Find all messages up to and including the clicked message
      // Build the message list by finding the rewind target and its ancestors
      const messagesUpToRewind: typeof conv.messages = [];
      const messageMap = new Map(conv.messages.map((m) => [m.id, m]));

      // Walk backwards from target to build the chain (for parentUuid chains)
      const chain: typeof conv.messages = [];
      let current: (typeof conv.messages)[number] | undefined = targetMessage;
      while (current) {
        chain.unshift(current);
        current = current.parentUuid ? messageMap.get(current.parentUuid) : undefined;
      }
      // If parentUuid chain only has the target itself (or is empty), fall back to position-based slice.
      // This happens when:
      // - JSONL files don't contain parentUuid (SDK doesn't write it)
      // - parentUuid references a message ID that's not in the map
      // In these cases, use position-based slicing which is reliable.
      if (chain.length <= 1) {
        // Position-based: take messages from start up to and including target
        const targetIndex = conv.messages.indexOf(targetMessage);
        messagesUpToRewind.push(...conv.messages.slice(0, targetIndex + 1));
        logger.debug('Using position-based slice (parentUuid chain incomplete)', {
          chainLength: chain.length,
          targetIndex,
          sliceLength: targetIndex + 1,
        });
      } else {
        messagesUpToRewind.push(...chain);
      }

      logger.debug('Filtered messages for rewind', {
        total: conv.messages.length,
        filtered: messagesUpToRewind.length,
        rewindTargetId: message_id,
        usedPositionFallback: !messageMap.has(message_id),
      });

      // Step 5: Send rewound response - same session ID (fork happens lazily)
      // The SDK fork is lazy - the actual new session ID comes when the first message is sent.
      // The agent-bridge handles JSONL cleanup (deleting original + intermediate copies).
      window.postMessage(
        {
          type: 'conversation:rewound',
          uuid: crypto.randomUUID(),
          session_id,
          new_session_id: session_id, // Same ID for now - SDK fork is lazy
          rewind_to_message_id: message_id,
          messages: messagesUpToRewind.map((m) => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: m.content,
            timestamp: m.createdAt,
            toolUses: m.toolUses,
            parentUuid: m.parentUuid,
          })),
        },
        '*'
      );
    } else {
      // Conversation not found - return empty (shouldn't happen normally)
      logger.warn('Conversation not found for rewind', { session_id });
      window.postMessage(
        {
          type: 'conversation:rewound',
          uuid: crypto.randomUUID(),
          session_id,
          new_session_id: session_id, // Same ID for now - SDK fork is lazy
          rewind_to_message_id: message_id,
          messages: [],
        },
        '*'
      );
    }
  } catch (err: unknown) {
    logger.error('Conversation rewind error', err);
    // On error, still respond with same session to avoid breaking the UI
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
  }
}
