import { markSessionAsForked, setRewindContext } from '../use-tauri-session';

import type { RewindContextMessage } from '../types/tauri-types';
import type { WebviewMessage } from '@/types/protocol';

import {
  agentRewindFiles,
  agentGetSdkSessionId,
  conversationCreate,
  conversationList,
  conversationLoad,
  conversationDelete,
  conversationUpdateTitle,
  conversationFork,
} from '@/lib/api/backend';
import { useCheckpointStore } from '@/stores/agent/checkpoint-store';

export async function handleConversationCreate(
  message: Extract<WebviewMessage, { type: 'conversation:create' }>
): Promise<void> {
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
}

export async function handleConversationList(
  message: Extract<WebviewMessage, { type: 'conversation:list' }>
): Promise<void> {
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
    console.error('[Orbit] Conversation delete error:', err);
  }
}

export async function handleConversationUpdateTitle(
  message: Extract<WebviewMessage, { type: 'conversation:updateTitle' }>
): Promise<void> {
  try {
    await conversationUpdateTitle(message.session_id, message.title);
  } catch (err: unknown) {
    console.error('[Orbit] Conversation title update error:', err);
  }
}

// TESTED: This rewind flow is covered by integration tests.
//     If you modify this, run: cd agent-bridge && bun test
//     Test file: src/__tests__/combined-rewind.test.ts
export async function handleConversationRewind(
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
