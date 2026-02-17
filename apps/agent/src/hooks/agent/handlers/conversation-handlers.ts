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
  // in ChatMessageService remaps the frontend to the SDK ID at that point.
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
            ...(m.thinkingDurationMs !== undefined
              ? { thinkingDurationMs: m.thinkingDurationMs }
              : {}),
            ...(m.toolUses && m.toolUses.length > 0 ? { toolUses: m.toolUses } : {}),
            ...(m.usage ? { usage: m.usage } : {}),
            // parentUuid for active chain resolution (getActiveChain defense-in-depth)
            ...(m.parentUuid !== undefined ? { parentUuid: m.parentUuid } : {}),
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
    const { message_id, user_message_id, session_id, message_index, current_messages } = message;

    // Step 1: Get the checkpoint using the USER message ID
    const checkpointStore = useCheckpointStore.getState();
    const rewindCheckpoints = checkpointStore.getRewindCheckpoints(session_id, user_message_id);

    // Step 2: Rewind files to the turn END checkpoint.
    // File rewind is best-effort; the conversation rewind must always complete.
    // Safety timeout: if the bridge hangs (e.g., SDK retry loop on same query),
    // give up after 10s so conversation rewind (Steps 3-5) can proceed.
    if (rewindCheckpoints?.rewindFiles) {
      try {
        const FILE_REWIND_TIMEOUT_MS = 10_000;
        await Promise.race([
          agentRewindFiles(session_id, rewindCheckpoints.rewindFiles),
          new Promise<never>((_, reject) => {
            setTimeout(() => {
              reject(new Error('File rewind timed out'));
            }, FILE_REWIND_TIMEOUT_MS);
          }),
        ]);
      } catch (rewindErr) {
        logger.warn('File rewind failed (continuing with conversation rewind)', {
          error: rewindErr instanceof Error ? rewindErr.message : String(rewindErr),
        });
      }
    }

    // Step 3: Load conversation from disk to get the SDK message ID
    logger.warn('Rewind step 3: loading conversation from disk', { session_id });
    const conv = await conversationLoad(session_id);
    logger.warn('Rewind step 3: conversation loaded', {
      hasConv: conv !== null,
      messageCount: conv?.messages.length ?? 0,
    });

    // Find the target message — priority chain:
    //   1. Direct disk ID match (message_id found in JSONL by ID)
    //   2. Content-validated position match (first rewind: frontend UUID ≠ SDK UUID
    //      but the message at message_index has matching content → disk is fresh)
    //   3. Frontend messages fallback (rewind 2+: disk is stale/truncated)
    //   4. Unvalidated position fallback (no frontend messages available — legacy)
    let targetMessage: ConversationMessageDto | undefined;
    let sdkMessageId: string | undefined;
    let useFrontendMessages = false;

    const messageMap = conv
      ? new Map(conv.messages.map((m) => [m.id, m]))
      : new Map<string, ConversationMessageDto>();

    if (conv) {
      // Priority 1: Direct ID match — works when message_id is already an SDK UUID
      targetMessage = messageMap.get(message_id);

      if (targetMessage) {
        sdkMessageId = targetMessage.id;
      } else {
        // Priority 2: Content-validated position match
        const positionCandidate =
          message_index >= 0 && message_index < conv.messages.length
            ? conv.messages[message_index]
            : undefined;

        const frontendTarget = current_messages?.find((m) => m.id === message_id);
        // Content validation: strict equality for user messages (always complete),
        // prefix match for assistant messages (may be interrupted mid-stream,
        // so persisted content can be shorter than frontend content).
        // (Code review: Opus cycle 3, issue #5)
        const contentMatches =
          positionCandidate !== undefined &&
          positionCandidate.role === frontendTarget?.role &&
          (positionCandidate.role === 'user'
            ? positionCandidate.content === frontendTarget.content
            : positionCandidate.content.startsWith(frontendTarget.content.slice(0, 200)) ||
              frontendTarget.content.startsWith(positionCandidate.content.slice(0, 200)));

        if (positionCandidate && contentMatches) {
          targetMessage = positionCandidate;
          sdkMessageId = targetMessage.id;
          logger.warn('Rewind: Priority 2 — content-validated position match', {
            sdkMessageId,
            index: message_index,
          });
        } else if (current_messages && current_messages.length > 0) {
          // Priority 3: Frontend messages fallback — disk is stale (rewind 2+)
          sdkMessageId = message_id;
          useFrontendMessages = true;
          logger.warn('Rewind: Priority 3 — frontend messages fallback', {
            sdkMessageId,
            frontendMsgCount: current_messages.length,
          });
        } else if (positionCandidate) {
          // Priority 4: Unvalidated position fallback — no frontend messages to validate
          targetMessage = positionCandidate;
          sdkMessageId = targetMessage.id;
          logger.warn('Rewind: Priority 4 — unvalidated position fallback', {
            sdkMessageId,
          });
        }
      }
    } else if (current_messages && current_messages.length > 0) {
      // No disk data at all — use frontend messages
      sdkMessageId = message_id;
      useFrontendMessages = true;
    }

    // Step 4: Fork the session at the target message.
    //
    // Always fork when the target was found in the disk JSONL — this is Claude Code's
    // approach. The SDK creates a new session with parentUuid branching that naturally
    // handles dead branches. No timeouts needed: bridge calls are awaited directly.
    if (sdkMessageId && !useFrontendMessages) {
      logger.warn('Rewind step 4: forking session at target', { session_id, sdkMessageId });
      try {
        await agentForkSessionAt(session_id, sdkMessageId);
        checkpointStore.setPendingConversationFork(session_id, sdkMessageId);
      } catch (forkErr) {
        logger.warn('Session fork failed (continuing with rewind)', {
          error: forkErr instanceof Error ? forkErr.message : String(forkErr),
        });
      }
    } else {
      logger.warn('Rewind step 4: skipping fork', {
        sdkMessageId,
        useFrontendMessages,
      });
    }

    // Step 5: Build the message list to display
    // Priority: disk messages (first rewind) > frontend messages (rewind 2+) > empty
    logger.warn('Rewind step 5: building message list', {
      hasConv: conv !== null,
      hasTarget: targetMessage !== undefined,
      useFrontendMessages,
      path:
        conv && targetMessage && !useFrontendMessages
          ? 'disk'
          : current_messages && current_messages.length > 0
            ? 'frontend'
            : 'empty',
    });
    if (conv && targetMessage && !useFrontendMessages) {
      // Disk data available — use disk messages
      const messagesUpToRewind: typeof conv.messages = [];

      const chain: typeof conv.messages = [];
      let current: (typeof conv.messages)[number] | undefined = targetMessage;
      while (current) {
        chain.unshift(current);
        current = current.parentUuid ? messageMap.get(current.parentUuid) : undefined;
      }

      if (chain.length <= 1) {
        const targetIndex = conv.messages.indexOf(targetMessage);
        messagesUpToRewind.push(...conv.messages.slice(0, targetIndex + 1));
      } else {
        messagesUpToRewind.push(...chain);
      }

      window.postMessage(
        {
          type: 'conversation:rewound',
          uuid: crypto.randomUUID(),
          session_id,
          new_session_id: session_id,
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
    } else if (current_messages && current_messages.length > 0) {
      // Disk data unavailable but frontend messages exist — use them as fallback.
      // This happens on subsequent rewinds after forkSessionAt deleted/truncated the JSONL.
      window.postMessage(
        {
          type: 'conversation:rewound',
          uuid: crypto.randomUUID(),
          session_id,
          new_session_id: session_id,
          rewind_to_message_id: message_id,
          messages: current_messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: Date.now(),
            parentUuid: m.parentUuid,
          })),
        },
        '*'
      );
    } else {
      window.postMessage(
        {
          type: 'conversation:rewound',
          uuid: crypto.randomUUID(),
          session_id,
          new_session_id: session_id,
          rewind_to_message_id: message_id,
          messages: [],
        },
        '*'
      );
    }
  } catch (err: unknown) {
    logger.error('handleConversationRewind failed', err);
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
