import { createLogger } from '@orbit/common/lib';

import { ensureSession } from '../use-tauri-session';

import type { AttachmentContentBlock } from '@/lib/api';
import type { WebviewMessage } from '@/types/protocol';

const logger = createLogger('AgentSdkHandlers');

import {
  agentSendMessage,
  agentInterrupt,
  agentRespondPermission,
  agentSetThinkingMode,
  agentSetEffortLevel,
  agentSetModel,
  agentSetPlanMode,
  agentSetAcceptMode,
} from '@/lib/api';
import { useCheckpointStore } from '@/stores/agent/checkpoint-store';
import { THINKING_MODE_BUDGET } from '@/stores/agent/tool-store';
import { useChatStore } from '@/stores/chat/chat-store';

export async function handleMessageSend(
  message: Extract<WebviewMessage, { type: 'message:send' }>
): Promise<void> {
  try {
    // Ensure session exists
    await ensureSession(message.session_id);

    // Track this user message ID for checkpoint association
    // The checkpoint that arrives will be stored against this user message ID
    useCheckpointStore.getState().onUserMessageSent(message.session_id, message.uuid);

    // Mark message as compacting when /compact is sent (cleared by compact_complete event)
    if (message.content.trim() === '/compact') {
      useChatStore.getState().markCompacting(message.uuid);
    }

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

    // Attach file paths as a separate text content block so the agent knows
    // which files the user is referencing. Sent as an attachment (not prepended
    // to the message string) so the original user text is preserved in JSONL
    // and renders cleanly on conversation reload.
    const contentToSend = message.content;
    if (message.context?.files && message.context.files.length > 0) {
      const fileList = message.context.files.map((f) => `- ${f}`).join('\n');
      attachments.push({
        type: 'text',
        text: `The user has attached the following files for context. Use your Read tool to read them if needed:\n${fileList}`,
      });
    }

    // Convert element contexts (from browser element selection) to a descriptive
    // text attachment so the agent knows what the user selected on the page.
    if (message.context?.elements && message.context.elements.length > 0) {
      const elementDescriptions = message.context.elements.map((el) => {
        const lines: string[] = [];
        lines.push(`Component: ${el.componentName}`);
        lines.push(`Tag: <${el.tagName}>`);
        if (el.filePath) lines.push(`File: ${el.filePath}:${String(el.lineNumber)}`);
        if (el.selector) lines.push(`Selector: ${el.selector}`);
        if (el.componentStack.length > 0) lines.push(`Stack: ${el.componentStack.join(' > ')}`);
        if (Object.keys(el.props).length > 0) lines.push(`Props: ${JSON.stringify(el.props)}`);
        if (el.outerHTML) lines.push(`HTML:\n\`\`\`html\n${el.outerHTML.slice(0, 3000)}\n\`\`\``);
        return lines.join('\n');
      });

      attachments.push({
        type: 'text',
        text: `The user selected the following element(s) from the embedded browser:\n\n${elementDescriptions.join('\n\n---\n\n')}`,
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
    await agentRespondPermission(
      message.request_id,
      message.decision,
      message.always ?? false,
      message.answers
    );
  } catch (err: unknown) {
    logger.error('Permission response error', err);
  }
}

export async function handleThinkingSet(
  message: Extract<WebviewMessage, { type: 'thinking:set' }>
): Promise<void> {
  try {
    const enabled = message.mode !== 'off';
    const maxTokens = THINKING_MODE_BUDGET[message.mode];
    await agentSetThinkingMode(message.session_id, enabled, maxTokens);
  } catch (err: unknown) {
    logger.error('Set thinking mode error', err);
  }
}

export async function handleEffortLevelSet(
  message: Extract<WebviewMessage, { type: 'effort:set' }>
): Promise<void> {
  try {
    await agentSetEffortLevel(message.session_id, message.effort);
  } catch (err: unknown) {
    logger.error('Set effort level error', err);
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
