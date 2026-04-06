import type { ChatMessage, ThinkingBlock } from '@/components/chat';
import type {
  ConversationDto,
  ConversationMessageDto,
  SessionUsageDto,
  ToolUseDto,
} from '@/lib/api/conversations';
import type { ScrollIntent } from '@/stores/chat/chat-store';

import { getActiveChain } from '@/components/chat/messages/message-utils';
import { toCachedImagePreviewUrl } from '@/lib/api/image-cache';
import { collectUsageMessageIds, toContextUsage } from '@/lib/context-usage';
import { queryClient, queryKeys } from '@/lib/query';
import { useToolStore } from '@/stores/agent/tool-store';
import { useChatStore } from '@/stores/chat/chat-store';

interface PersistedChatMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly content: string;
  readonly thinking?: string | undefined;
  readonly thinkingDurationMs?: number | undefined;
  readonly thinkingPhases?: readonly {
    readonly content: string;
    readonly contentOffset?: number | undefined;
    readonly ordinal?: number | undefined;
    readonly durationMs?: number | undefined;
  }[];
  readonly isInterrupted?: boolean | undefined;
  readonly turnDurationMs?: number | undefined;
  readonly parentUuid?: string | null | undefined;
  readonly toolUses?: readonly Pick<ToolUseDto, 'name' | 'success'>[];
  readonly attachedImages?: ConversationMessageDto['attachedImages'] | undefined;
}

export interface HydrateConversationSnapshotInput {
  readonly sessionId: string;
  readonly persistedMessages: readonly ConversationMessageDto[];
  readonly sessionUsage?: SessionUsageDto | undefined;
  readonly scrollIntent: ScrollIntent;
  readonly cachedMessages?: readonly ChatMessage[] | undefined;
  readonly resolvedMessages?: readonly ChatMessage[] | undefined;
  readonly source: 'event-load' | 'query-fast-path';
  readonly title: string;
  readonly activateToolSession?: boolean;
}

export function mapPersistedMessage(message: PersistedChatMessage): ChatMessage {
  const thinkingPhases = message.thinkingPhases ?? [];
  const thinkingBlocks: ThinkingBlock[] | undefined =
    thinkingPhases.length > 0
      ? thinkingPhases.map((phase, index) => ({
          content: phase.content,
          durationMs:
            phase.durationMs ??
            (index === thinkingPhases.length - 1 ? (message.thinkingDurationMs ?? 0) : 0),
          contentOffset: phase.contentOffset,
          ordinal: phase.ordinal,
        }))
      : message.thinking
        ? [{ content: message.thinking, durationMs: message.thinkingDurationMs ?? 0 }]
        : undefined;

  const base: ChatMessage = {
    id: message.id,
    role: message.role,
    content: message.content,
    displayedContent: message.content,
    ...(message.parentUuid !== undefined ? { parentUuid: message.parentUuid } : {}),
    ...(thinkingBlocks ? { thinkingBlocks } : {}),
    ...(message.thinking ? { thinking: message.thinking } : {}),
    ...(message.thinkingDurationMs !== undefined
      ? { thinkingDurationMs: message.thinkingDurationMs }
      : {}),
    ...(message.turnDurationMs !== undefined ? { turnDurationMs: message.turnDurationMs } : {}),
    ...(message.attachedImages && message.attachedImages.length > 0
      ? {
          attachedImages: message.attachedImages.map((image) => ({
            name: image.name,
            mimeType: image.mimeType,
            previewUrl: toCachedImagePreviewUrl(image.previewUrl),
          })),
        }
      : {}),
  };

  if (message.isInterrupted === true) {
    const hasRejectedQuestion = message.toolUses?.some(
      (tool) => tool.name.toLowerCase() === 'askuserquestion' && !tool.success
    );
    return {
      ...base,
      isInterrupted: true,
      ...(hasRejectedQuestion ? { interruptReason: 'User rejected to answer' } : {}),
    };
  }

  return base;
}

function buildActiveChainMessages(
  persistedMessages: readonly ConversationMessageDto[]
): ChatMessage[] {
  const allBackendMessages = persistedMessages
    .filter(
      (message): message is ConversationMessageDto & { role: 'user' | 'assistant' } =>
        message.role === 'user' || message.role === 'assistant'
    )
    .map((message) => mapPersistedMessage(message));

  return getActiveChain(allBackendMessages);
}

function enrichClientOnlyFields(
  messages: ChatMessage[],
  cachedMessages?: readonly ChatMessage[]
): void {
  if (!cachedMessages || cachedMessages.length === 0) {
    return;
  }

  const cachedById = new Map(cachedMessages.map((message) => [message.id, message]));
  for (const message of messages) {
    if (message.interruptReason !== undefined) {
      continue;
    }

    const cached = cachedById.get(message.id);
    if (cached?.interruptReason !== undefined) {
      message.interruptReason = cached.interruptReason;
    }
  }
}

function restoreSessionUsage(
  sessionId: string,
  persistedMessages: readonly ConversationMessageDto[],
  activeChainIds: Set<string>,
  sessionUsage?: SessionUsageDto
): void {
  if (sessionUsage) {
    const processedMessageIds = collectUsageMessageIds(persistedMessages);
    useToolStore
      .getState()
      .restoreSessionUsage(
        sessionId,
        toContextUsage(sessionUsage),
        processedMessageIds.length > 0 ? processedMessageIds : undefined
      );
    return;
  }

  if (persistedMessages.length === 0) {
    return;
  }

  const seenIds = new Set<string>();
  const processedMessageIds: string[] = [];
  const cumulativeUsage = persistedMessages
    .filter((message) => activeChainIds.has(message.id))
    .reduce(
      (accumulator, message) => {
        if (!message.usage || seenIds.has(message.id)) {
          return accumulator;
        }

        seenIds.add(message.id);
        processedMessageIds.push(message.id);
        return {
          inputTokens: accumulator.inputTokens + message.usage.inputTokens,
          outputTokens: accumulator.outputTokens + message.usage.outputTokens,
          cacheReadInputTokens:
            accumulator.cacheReadInputTokens + (message.usage.cacheReadInputTokens ?? 0),
          cacheCreationInputTokens:
            accumulator.cacheCreationInputTokens + (message.usage.cacheCreationInputTokens ?? 0),
          totalCostUsd: accumulator.totalCostUsd + (message.usage.totalCostUsd ?? 0),
        };
      },
      {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        totalCostUsd: 0,
      }
    );

  if (processedMessageIds.length > 0) {
    useToolStore.getState().restoreSessionUsage(sessionId, cumulativeUsage, processedMessageIds);
  }
}

function restoreTools(
  sessionId: string,
  persistedMessages: readonly ConversationMessageDto[],
  activeChainIds: Set<string>
): void {
  for (const message of persistedMessages) {
    if (!activeChainIds.has(message.id) || !message.toolUses || message.toolUses.length === 0) {
      continue;
    }

    useToolStore.getState().restoreToolsForMessage(
      message.id,
      message.toolUses.map((tool) => ({
        id: tool.id,
        name: tool.name,
        input: tool.input,
        success: tool.success,
        ...(tool.output !== undefined ? { output: tool.output } : {}),
        ...(tool.contentOffset !== undefined ? { contentOffset: tool.contentOffset } : {}),
        ...(tool.ordinal !== undefined ? { ordinal: tool.ordinal } : {}),
      })),
      sessionId
    );
  }
}

function seedConversationDetailCache(input: HydrateConversationSnapshotInput): void {
  if (input.source !== 'event-load') {
    return;
  }

  const now = Date.now();
  queryClient.setQueryData(queryKeys.conversations.detail(input.sessionId), {
    sessionId: input.sessionId,
    title: input.title,
    createdAt: now,
    updatedAt: now,
    messages: [...input.persistedMessages],
    ...(input.sessionUsage ? { sessionUsage: input.sessionUsage } : {}),
  } satisfies ConversationDto);
}

export function hydrateConversationSnapshot(
  input: HydrateConversationSnapshotInput
): ChatMessage[] {
  const messages = [
    ...(input.resolvedMessages ?? buildActiveChainMessages(input.persistedMessages)),
  ];
  enrichClientOnlyFields(messages, input.cachedMessages);

  const activeChainIds = new Set(messages.map((message) => message.id));
  restoreSessionUsage(input.sessionId, input.persistedMessages, activeChainIds, input.sessionUsage);

  const chatStore = useChatStore.getState();
  const existingSession = chatStore.sessions[input.sessionId];

  // Detect layout-equivalent rehydration: if the session already has the same
  // messages with identical height-affecting fields, skip setMessages() to
  // preserve layoutVersion. This prevents the Virtuoso size cache from being
  // invalidated on warm revisits where the data hasn't actually changed.
  // Compares IDs, content length, thinking presence, and image count — all
  // fields that affect rendered row height.
  const isLayoutEquivalent =
    existingSession?.hydrationState === 'hydrated' &&
    existingSession.messages.length === messages.length &&
    existingSession.messages.length > 0 &&
    existingSession.messages.every((existing, i) => {
      const incoming = messages[i];
      if (existing.id !== incoming?.id) return false;
      if (existing.content.length !== incoming.content.length) return false;
      if ((existing.thinking ?? '').length !== (incoming.thinking ?? '').length) return false;
      if ((existing.thinkingBlocks?.length ?? 0) !== (incoming.thinkingBlocks?.length ?? 0))
        return false;
      if ((existing.attachedImages?.length ?? 0) !== (incoming.attachedImages?.length ?? 0))
        return false;
      return true;
    });

  if (isLayoutEquivalent) {
    chatStore.setScrollIntent(input.sessionId, input.scrollIntent);
  } else {
    chatStore.setMessages(input.sessionId, messages, input.scrollIntent);
  }

  chatStore.markSessionHydrated(input.sessionId);
  chatStore.markSessionLoaded(input.sessionId);
  chatStore.bumpConversationLoadEpoch();

  restoreTools(input.sessionId, input.persistedMessages, activeChainIds);
  if (input.activateToolSession !== false) {
    useToolStore.getState().switchSession(input.sessionId);
  }
  seedConversationDetailCache(input);

  return messages;
}
