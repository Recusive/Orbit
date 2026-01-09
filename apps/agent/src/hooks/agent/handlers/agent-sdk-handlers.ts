import { formatConversationContext } from '../use-tauri-context';
import { ensureSession, consumeRewindContext } from '../use-tauri-session';

import type { AttachmentContentBlock } from '@/lib/api/backend';
import type { WebviewMessage } from '@/types/protocol';

import {
  agentSendMessage,
  agentInterrupt,
  agentRespondPermission,
  agentSetThinkingMode,
  agentSetModel,
  agentSetPlanMode,
  agentSetAcceptMode,
} from '@/lib/api/backend';
import { useCheckpointStore } from '@/stores/agent/checkpoint-store';

export async function handleMessageSend(
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

export async function handleAgentStop(
  message: Extract<WebviewMessage, { type: 'agent:stop' }>
): Promise<void> {
  try {
    await agentInterrupt(message.session_id);
  } catch (err: unknown) {
    console.error('[Orbit] Agent interrupt error:', err);
  }
}

export async function handlePermissionResponse(
  message: Extract<WebviewMessage, { type: 'permission:response' }>
): Promise<void> {
  try {
    await agentRespondPermission(message.request_id, message.decision, message.always ?? false);
  } catch (err: unknown) {
    console.error('[Orbit] Permission response error:', err);
  }
}

export async function handleThinkingSet(
  message: Extract<WebviewMessage, { type: 'thinking:set' }>
): Promise<void> {
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
}

export async function handleModelSet(
  message: Extract<WebviewMessage, { type: 'model:set' }>
): Promise<void> {
  try {
    await agentSetModel(message.session_id, message.model);
  } catch (err: unknown) {
    console.error('[Orbit] Set model error:', err);
  }
}

export async function handleInputModeSet(
  message: Extract<WebviewMessage, { type: 'inputMode:set' }>
): Promise<void> {
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
}
