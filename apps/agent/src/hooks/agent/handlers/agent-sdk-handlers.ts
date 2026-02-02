import { createLogger } from '@orbit/common/lib';

import { formatConversationContext } from '../use-tauri-context';
import { ensureSession, consumeRewindContext } from '../use-tauri-session';

import type { AttachmentContentBlock } from '@/lib/api';
import type { WebviewMessage } from '@/types/protocol';

const logger = createLogger('AgentSdkHandlers');

import {
  agentSendMessage,
  agentInterrupt,
  agentRespondPermission,
  agentSetThinkingMode,
  agentSetModel,
  agentSetPlanMode,
  agentSetAcceptMode,
} from '@/lib/api';
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

    // Prepend attached file paths so the agent knows which files the user is referencing.
    // The agent can then use its Read tool to inspect file contents on demand,
    // avoiding blowing the context window with large files.
    let contentToSend = message.content;
    if (message.context?.files && message.context.files.length > 0) {
      const fileList = message.context.files.map((f) => `- ${f}`).join('\n');
      const fileContext = `The user has attached the following files for context. Use your Read tool to read them if needed:\n${fileList}\n\n`;
      contentToSend = fileContext + contentToSend;
    }

    // Check if this session has rewind context (from a rewind fork)
    // If so, prepend the conversation history to the first message
    // This is the key fix: we pass truncated history as context, NOT via SDK resume
    const rewindContext = consumeRewindContext(message.session_id);
    if (rewindContext && rewindContext.length > 0) {
      const contextPrefix = formatConversationContext(rewindContext);
      // Prepend rewind context to contentToSend (NOT message.content) to preserve
      // any previously prepended file attachments. (Code review: Codex cycle 1, issue #1)
      contentToSend = contextPrefix + contentToSend;
      logger.debug('Prepended rewind context to message', {
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
    logger.error('Agent send message error', { error: errorMessage });
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
    logger.error('Agent interrupt error', err);
  }
}

export async function handlePermissionResponse(
  message: Extract<WebviewMessage, { type: 'permission:response' }>
): Promise<void> {
  try {
    await agentRespondPermission(message.request_id, message.decision, message.always ?? false);
  } catch (err: unknown) {
    logger.error('Permission response error', err);
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
    logger.error('Set thinking mode error', err);
  }
}

export async function handleModelSet(
  message: Extract<WebviewMessage, { type: 'model:set' }>
): Promise<void> {
  try {
    await agentSetModel(message.session_id, message.model);
  } catch (err: unknown) {
    logger.error('Set model error', err);
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
    logger.error('Set input mode error', err);
  }
}
