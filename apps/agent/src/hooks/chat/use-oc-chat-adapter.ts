import { createLogger } from '@orbit/common/lib';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';

import { createChatOpenHandlers } from './handlers/chat-actions';
import { useOcChat } from './use-oc-chat';
import { useOcStreamingReveal } from './use-oc-streaming-reveal';

import type { ImageAttachment } from '@/components/chat/input/types';
import type { ChatMessage, ThinkingBlock } from '@/components/chat/messages';
import type {
  PermissionRequest,
  ToolExecution,
  ToolStatus,
  UsageData,
} from '@/stores/agent/tool-store';
import type {
  OcMessage,
  OcPart,
  OcPermissionAsked,
  OcQuestionAnswer,
  OcQuestionRequest,
  OcSessionStatus,
} from '@/types/opencode';

import { useTauri } from '@/hooks/agent/use-tauri';
import { ocSessionService } from '@/services/opencode/oc-session-service';
import { useToolStore } from '@/stores/agent/tool-store';
import { useChatStore } from '@/stores/chat/chat-store';
import {
  resolveOcModelSupportsImageInput,
  useOcPermissionStore,
  useOcProviderStore,
  useOcSessionStore,
} from '@/stores/opencode';

type OcRenderedMessage = ReturnType<typeof useOcChat>['messages'][number];

const logger = createLogger('OcChatAdapter');

interface AdaptedOcParts {
  content: string;
  thinkingBlocks: ThinkingBlock[];
  tools: ToolExecution[];
  images: ImageAttachment[];
  interruptReason?: string;
  isInterrupted: boolean;
  isThinkingActive: boolean;
  hasCompaction: boolean;
}

interface AdaptedOcMessage {
  chat: ChatMessage;
  tools: ToolExecution[];
  hasCompaction: boolean;
}

interface SyncActions {
  startTool: typeof useToolStore.getState extends () => infer T
    ? T extends { startTool: infer F }
      ? F
      : never
    : never;
  completeTool: typeof useToolStore.getState extends () => infer T
    ? T extends { completeTool: infer F }
      ? F
      : never
    : never;
  updateToolInput: typeof useToolStore.getState extends () => infer T
    ? T extends { updateToolInput: infer F }
      ? F
      : never
    : never;
}

interface OcRewindTarget {
  messageId: string;
  text: string;
}

function appendLine(content: string, line: string): string {
  if (content.length === 0) {
    return line;
  }

  return `${content}\n${line}`;
}

/**
 * OpenCode tools use camelCase parameter names (filePath, oldString, newString)
 * while the frontend widgets expect snake_case (file_path, old_string, new_string).
 * This adds snake_case aliases so both naming conventions resolve correctly.
 */
const OC_KEY_ALIASES: readonly (readonly [string, string])[] = [
  ['filePath', 'file_path'],
  ['oldString', 'old_string'],
  ['newString', 'new_string'],
  ['replaceAll', 'replace_all'],
];

function normalizeToolInput(input: Record<string, unknown>): Record<string, unknown> {
  const result = { ...input };
  for (const [camel, snake] of OC_KEY_ALIASES) {
    if (camel in result && !(snake in result)) {
      result[snake] = result[camel];
    }
  }
  return result;
}

function getToolInput(part: Extract<OcPart, { type: 'tool' }>): Record<string, unknown> {
  const input = normalizeToolInput({ ...part.state.input });
  const meta = 'metadata' in part.state ? part.state.metadata : undefined;
  const todos = meta?.['todos'];

  if ((part.tool === 'todowrite' || part.tool === 'todoread') && Array.isArray(todos)) {
    return {
      ...input,
      todos,
    };
  }

  // Map OpenCode question answers into the format AskUserQuestionWidget expects
  if (part.tool === 'question') {
    const metaAnswers = meta?.['answers'];
    const questions = input['questions'];
    if (Array.isArray(metaAnswers) && Array.isArray(questions)) {
      const answersMap: Record<string, string> = {};
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i] as Record<string, unknown> | undefined;
        const a = metaAnswers[i] as string[] | undefined;
        if (q !== undefined && typeof q['question'] === 'string' && Array.isArray(a)) {
          answersMap[q['question']] = a.join(', ');
        }
      }
      return { ...input, answers: answersMap };
    }
  }

  return input;
}

function getErrorMessage(
  error: NonNullable<Extract<OcMessage, { role: 'assistant' }>['error']>
): string {
  const data = error.data;
  if ('message' in data && typeof data.message === 'string' && data.message.length > 0) {
    return data.message;
  }

  return error.name;
}

function getPrimaryText(parts: OcPart[]): string {
  const candidates = parts
    .filter((part): part is Extract<OcPart, { type: 'text' }> => part.type === 'text')
    .filter((part) => !part.synthetic && !part.ignored);

  return candidates.reduce<string>((best, part) => {
    if (part.text.length > best.length) {
      return part.text;
    }

    return best;
  }, '');
}

export function filterOcMessages(
  messages: OcRenderedMessage[],
  revertMessageId: string | null
): OcRenderedMessage[] {
  if (revertMessageId === null) {
    return messages;
  }

  return messages.filter((entry) => entry.id < revertMessageId);
}

export function findOcRewindTarget(
  messages: OcRenderedMessage[],
  messageId: string
): OcRewindTarget | null {
  const index = messages.findIndex((entry) => entry.id === messageId);
  if (index === -1) {
    return null;
  }

  const clicked = messages[index];
  if (clicked === undefined) {
    return null;
  }

  if (clicked.role === 'user') {
    return {
      messageId: clicked.id,
      text: getPrimaryText(clicked.parts),
    };
  }

  const assistant = clicked.message as Extract<OcMessage, { role: 'assistant' }>;
  if (assistant.parentID) {
    const parent = messages.find(
      (entry) => entry.id === assistant.parentID && entry.role === 'user'
    );
    if (parent) {
      return {
        messageId: parent.id,
        text: getPrimaryText(parent.parts),
      };
    }
  }

  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const candidate = messages[cursor];
    if (candidate?.role === 'user') {
      return {
        messageId: candidate.id,
        text: getPrimaryText(candidate.parts),
      };
    }
  }

  return null;
}

export function adaptParts(parts: OcPart[], messageId: string, sessionId: string): AdaptedOcParts {
  let content = '';
  let ordinal = 0;
  let interruptReason: string | undefined;
  let isInterrupted = false;
  let isThinkingActive = false;
  let hasCompaction = false;
  const thinkingBlocks: ThinkingBlock[] = [];
  const tools: ToolExecution[] = [];
  const images: ImageAttachment[] = [];

  for (const part of parts) {
    const offset = content.length;

    switch (part.type) {
      case 'text':
        content += part.text;
        break;

      case 'reasoning':
        thinkingBlocks.push({
          content: part.text,
          durationMs: part.time.end !== undefined ? part.time.end - part.time.start : 0,
          contentOffset: offset,
          ordinal,
        });
        if (part.time.end === undefined) {
          isThinkingActive = true;
        }
        break;

      case 'tool': {
        const status: ToolStatus =
          part.state.status === 'completed'
            ? 'success'
            : part.state.status === 'error'
              ? 'error'
              : 'running';
        const tool: ToolExecution = {
          id: part.id,
          messageId,
          sessionId,
          toolName: part.tool.toLowerCase(),
          toolInput: getToolInput(part),
          status,
          success: part.state.status === 'completed',
          startedAt: 'time' in part.state ? part.state.time.start : Date.now(),
          contentOffset: offset,
          ordinal,
        };
        if (part.state.status === 'completed') {
          tool.toolOutput = part.state.output;
          tool.completedAt = part.state.time.end;
        }
        if (part.state.status === 'error') {
          tool.toolOutput = part.state.error;
          tool.completedAt = part.state.time.end;
        }
        tools.push(tool);
        break;
      }

      case 'step-start':
        break;

      case 'step-finish':
        break;

      case 'compaction':
        hasCompaction = true;
        break;

      case 'retry':
        interruptReason = `Retry #${String(part.attempt)}`;
        isInterrupted = true;
        break;

      case 'file': {
        const mime = part.mime;
        if (mime.startsWith('image/') && part.url) {
          images.push({
            name: part.filename ?? 'image',
            mimeType: mime,
            previewUrl: part.url,
          });
        } else {
          const file = part.filename ?? part.source?.path ?? part.url;
          content = appendLine(content, `Referenced: ${file}`);
        }
        break;
      }

      case 'patch':
        content = appendLine(content, `Patch: ${part.files.join(', ')}`);
        break;

      case 'agent':
        content = appendLine(content, `Agent: ${part.name}`);
        break;

      case 'snapshot':
        tools.push({
          id: `snapshot-${part.id}`,
          messageId,
          sessionId,
          toolName: 'snapshot',
          toolInput: { snapshot: part.snapshot },
          toolOutput: part.snapshot,
          status: 'success',
          success: true,
          startedAt: Date.now(),
          contentOffset: offset,
          ordinal,
        });
        break;

      case 'subtask':
        tools.push({
          id: part.id,
          messageId,
          sessionId,
          toolName: 'task',
          toolInput: {
            description: part.description,
            prompt: part.prompt,
            subagent_type: part.agent,
            ...(part.model ? { model: `${part.model.providerID}/${part.model.modelID}` } : {}),
          },
          status: 'success',
          success: true,
          startedAt: Date.now(),
          contentOffset: offset,
          ordinal,
        });
        break;
    }

    ordinal += 1;
  }

  return {
    content,
    thinkingBlocks,
    tools,
    images,
    ...(interruptReason !== undefined ? { interruptReason } : {}),
    isInterrupted,
    isThinkingActive,
    hasCompaction,
  };
}

export function buildOcSessionUsage(messages: OcRenderedMessage[]): UsageData {
  // Use the last assistant message's token breakdown as a context window snapshot.
  // Each turn's tokens.input reflects what the model actually received — after
  // compaction, this value drops because old messages were replaced with a summary.
  // Matches the reference app: session-context-metrics.ts:lastAssistantWithTokens()
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const entry = messages[i];
    if (entry?.message.role !== 'assistant') {
      continue;
    }
    const tokens = entry.message.tokens;
    const total =
      tokens.input + tokens.output + tokens.reasoning + tokens.cache.read + tokens.cache.write;
    if (total <= 0) {
      continue;
    }
    return {
      inputTokens: tokens.input,
      outputTokens: tokens.output,
      cacheReadInputTokens: tokens.cache.read,
      cacheCreationInputTokens: tokens.cache.write,
      // Cost is still cumulative (lifetime spend, not current context)
      totalCostUsd: messages.reduce(
        (sum, m) => sum + (m.message.role === 'assistant' ? m.message.cost : 0),
        0
      ),
    };
  }

  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    totalCostUsd: 0,
  };
}

export function adaptPermission(permission: OcPermissionAsked): PermissionRequest {
  return {
    requestId: permission.id,
    sessionId: permission.sessionID,
    toolName: permission.permission || 'workspace',
    toolInput: permission.metadata,
    createdAt: Date.now(),
    patterns: permission.patterns,
    supportsAlwaysAllow: permission.always.length > 0,
  };
}

function seedSessionTools(sessionId: string): Map<string, ToolStatus> {
  const next = new Map<string, ToolStatus>();
  const { activeTools, completedTools } = useToolStore.getState();

  for (const tool of Object.values(activeTools)) {
    if (tool.sessionId === sessionId) {
      next.set(tool.id, tool.status);
    }
  }

  for (const tool of completedTools) {
    if (tool.sessionId === sessionId) {
      next.set(tool.id, tool.status);
    }
  }

  return next;
}

/**
 * [warning] TESTED: OpenCode tool syncing in this helper is covered by unit tests.
 *     If you modify this, run:
 *     bun run test -- apps/agent/src/__tests__/unit/hooks/chat/use-oc-chat-adapter.test.ts
 *     Test file: apps/agent/src/__tests__/unit/hooks/chat/use-oc-chat-adapter.test.ts
 */
export function syncOcTools(
  messages: AdaptedOcMessage[],
  synced: Map<string, ToolStatus>,
  actions: SyncActions
): Map<string, ToolStatus> {
  const next = new Map(synced);
  const ids = new Set<string>();

  for (const entry of messages) {
    for (const tool of entry.tools) {
      ids.add(tool.id);
      const prev = next.get(tool.id);

      if (prev === undefined) {
        actions.startTool(
          tool.id,
          tool.messageId,
          tool.toolName,
          tool.toolInput,
          tool.contentOffset,
          tool.sessionId,
          tool.ordinal
        );

        if (tool.status === 'success' || tool.status === 'error') {
          actions.completeTool(tool.id, tool.toolOutput, tool.status === 'success');
        }
      } else {
        actions.updateToolInput(tool.id, tool.toolInput);

        if (
          (prev === 'pending' || prev === 'running') &&
          (tool.status === 'success' || tool.status === 'error')
        ) {
          actions.completeTool(tool.id, tool.toolOutput, tool.status === 'success');
        }
      }

      next.set(tool.id, tool.status);
    }
  }

  for (const id of Array.from(next.keys())) {
    if (!ids.has(id)) {
      next.delete(id);
    }
  }

  return next;
}

function adaptOcMessage(
  entry: OcRenderedMessage,
  sessionId: string,
  status: OcSessionStatus | null,
  isLastAssistant: boolean
): AdaptedOcMessage {
  const adapted = adaptParts(entry.parts, entry.id, sessionId);
  const assistant = entry.message.role === 'assistant' ? entry.message : null;
  const retryReason = adapted.interruptReason;
  const turnDurationMs =
    assistant?.time.completed !== undefined
      ? assistant.time.completed - assistant.time.created
      : undefined;
  const isStreaming =
    assistant !== null &&
    isLastAssistant &&
    (status?.type === 'busy' || status?.type === 'retry') &&
    assistant.error === undefined;
  const errorMessage =
    assistant?.error !== undefined ? getErrorMessage(assistant.error) : undefined;
  const interruptReason = errorMessage ?? retryReason;
  const thinking = adapted.thinkingBlocks.map((block) => block.content).join('\n\n');
  const thinkingDurationMs = adapted.thinkingBlocks.reduce(
    (sum, block) => sum + block.durationMs,
    0
  );

  return {
    chat: {
      id: entry.id,
      role: entry.role,
      content: adapted.content,
      displayedContent: adapted.content,
      ...(isStreaming ? { isStreaming: true } : {}),
      ...(adapted.isInterrupted || errorMessage !== undefined ? { isInterrupted: true } : {}),
      ...(turnDurationMs !== undefined ? { turnDurationMs } : {}),
      ...(thinking.length > 0 ? { thinking } : {}),
      ...(thinkingDurationMs > 0 ? { thinkingDurationMs } : {}),
      ...(adapted.thinkingBlocks.length > 0 ? { thinkingBlocks: adapted.thinkingBlocks } : {}),
      ...(adapted.images.length > 0 ? { attachedImages: adapted.images } : {}),
      ...(adapted.isThinkingActive ? { isThinkingActive: true } : {}),
      ...(assistant?.parentID ? { parentUuid: assistant.parentID } : {}),
      ...(interruptReason !== undefined ? { interruptReason } : {}),
    },
    tools: adapted.tools,
    hasCompaction: adapted.hasCompaction,
  };
}

interface UseOcChatAdapterResult {
  sessionId: string | null;
  messages: ChatMessage[];
  pendingPermissions: PermissionRequest[];
  questions: OcQuestionRequest[];
  isAgentRunning: boolean;
  sessionUsage: UsageData;
  handleSend: (
    text: string,
    contextFiles?: string[],
    images?: ImageAttachment[],
    elements?: unknown[],
    skills?: string[]
  ) => void;
  handleStop: () => void;
  handleRewind: (messageId: string) => void;
  handlePermissionApprove: (requestId: string, always?: boolean) => void;
  handlePermissionDeny: (requestId: string) => void;
  handleQuestionReply: (requestId: string, answers: OcQuestionAnswer[]) => Promise<void>;
  handleQuestionReject: (requestId: string) => Promise<void>;
  handleOpenFile: (path: string) => void;
  handleOpenUrl: (url: string) => void;
}

export function useOcChatAdapter(): UseOcChatAdapterResult {
  const {
    sessionId,
    revertMessageId,
    messages,
    permissions,
    questions,
    status,
    isAgentBusy,
    handleSend: send,
    handleStop: stop,
    handlePermissionReply,
    handleQuestionReply,
    handleQuestionReject,
  } = useOcChat();
  const { postMessage } = useTauri();
  const providerId = useOcProviderStore((state) => state.selectedProviderId);
  const modelId = useOcProviderStore((state) => state.selectedModelId);
  const agent = useOcProviderStore((state) => state.selectedAgent);
  const variant = useOcProviderStore((state) => {
    if (!state.selectedProviderId || !state.selectedModelId) {
      return null;
    }

    const provider = state.providers.find((item) => item.id === state.selectedProviderId);
    const model = provider?.models[state.selectedModelId];
    const value = state.variantSelections[`${state.selectedProviderId}/${state.selectedModelId}`];

    if (value === undefined || model?.variants?.[value] === undefined) {
      return null;
    }

    return value;
  });
  const syncedRef = useRef(new Map<string, ToolStatus>());
  const prevSessionRef = useRef<string | null>(null);
  const visibleMessages = useMemo(
    () => filterOcMessages(messages, revertMessageId),
    [messages, revertMessageId]
  );
  const activeCompaction = useChatStore(
    (state) => (sessionId !== null ? state.activeCompactions[sessionId] : undefined) ?? null
  );

  const adapted = useMemo(() => {
    if (sessionId === null) {
      return [];
    }

    let lastAssistantIndex = -1;
    for (let index = visibleMessages.length - 1; index >= 0; index -= 1) {
      if (visibleMessages[index]?.role === 'assistant') {
        lastAssistantIndex = index;
        break;
      }
    }

    return visibleMessages.map((entry, index) =>
      adaptOcMessage(entry, sessionId, status, index === lastAssistantIndex)
    );
  }, [sessionId, status, visibleMessages]);

  useEffect(() => {
    if (sessionId === null) {
      syncedRef.current.clear();
      prevSessionRef.current = null;
      return;
    }

    if (sessionId !== prevSessionRef.current) {
      useToolStore.getState().switchSession(sessionId);
      syncedRef.current = seedSessionTools(sessionId);
      prevSessionRef.current = sessionId;
    }
  }, [sessionId]);

  useEffect(() => {
    const actions = useToolStore.getState();
    syncedRef.current = syncOcTools(adapted, syncedRef.current, {
      startTool: actions.startTool,
      completeTool: actions.completeTool,
      updateToolInput: actions.updateToolInput,
    });
  }, [adapted]);

  useEffect(() => {
    return () => {
      syncedRef.current.clear();
    };
  }, []);

  const sessionUsage = useMemo(() => buildOcSessionUsage(visibleMessages), [visibleMessages]);
  const pendingPermissions = useMemo(() => permissions.map(adaptPermission), [permissions]);
  const chatMessages = useMemo(() => {
    const entries = adapted.map((entry) => {
      const chat = entry.chat;
      // Backend user messages with a compaction part render as CompactIndicator
      if (entry.hasCompaction && chat.role === 'user') {
        return { ...chat, content: '/compact', displayedContent: '/compact' };
      }
      return chat;
    });
    // Synthetic message for live compaction (pending/timed_out)
    if (activeCompaction !== null) {
      entries.push({
        id: activeCompaction.messageId,
        role: 'user' as const,
        content: '/compact',
        displayedContent: '/compact',
      });
    }
    return entries;
  }, [activeCompaction, adapted]);
  const displayedMessages = useOcStreamingReveal(chatMessages);
  const open = useMemo(() => createChatOpenHandlers({ postMessage }), [postMessage]);

  const handleSend = useCallback(
    (text: string, _contextFiles?: string[], images?: ImageAttachment[]): void => {
      const trimmed = text.trim();
      if (trimmed === '/compact' || trimmed === '/summarize') {
        if (sessionId === null) {
          return;
        }

        if (!providerId || !modelId) {
          toast.warning('Connect a provider to compact this session');
          return;
        }

        if (useChatStore.getState().activeCompactions[sessionId] !== undefined) {
          return;
        }

        const syntheticId = `oc-compact-${crypto.randomUUID()}`;
        useChatStore.getState().markCompacting(sessionId, {
          backend: 'opencode',
          messageId: syntheticId,
          status: 'pending',
        });

        window.setTimeout(() => {
          useChatStore.getState().markCompactionTimedOut(sessionId, syntheticId);
        }, 30_000);

        void ocSessionService
          .compactSession(sessionId, providerId, modelId)
          .catch((error: unknown) => {
            logger.error('Failed to compact OpenCode session', error, { sessionId });
            useChatStore.getState().settleCompaction(sessionId);
          });
        return;
      }

      const modelSupportsImages = resolveOcModelSupportsImageInput(useOcProviderStore.getState());
      const safeImages = modelSupportsImages ? images : undefined;
      if (trimmed.length === 0 && (safeImages?.length ?? 0) === 0) {
        return;
      }

      void send(text, {
        agent,
        ...(providerId ? { providerId } : {}),
        ...(modelId ? { modelId } : {}),
        ...(variant ? { variant } : {}),
        ...(safeImages && safeImages.length > 0 ? { images: safeImages } : {}),
      });
    },
    [agent, modelId, providerId, send, sessionId, variant]
  );

  const handleStop = useCallback((): void => {
    void stop();
  }, [stop]);

  const handleRewind = useCallback(
    (messageId: string): void => {
      if (sessionId === null) {
        return;
      }

      const target = findOcRewindTarget(visibleMessages, messageId);
      if (target === null) {
        return;
      }

      void (async () => {
        try {
          if (status?.type !== 'idle') {
            await ocSessionService.abortSession(sessionId);
          }

          await ocSessionService.revertSession(sessionId, target.messageId);
          useOcSessionStore.getState().setSessionStatus(sessionId, { type: 'idle' });
          useOcPermissionStore.getState().clearSession(sessionId);
          useToolStore.getState().clearSessionTools(sessionId);
          syncedRef.current = new Map();

          if (target.text.length > 0) {
            window.dispatchEvent(
              new CustomEvent('prefillChatInput', {
                detail: { text: target.text },
              })
            );
          }
        } catch (error) {
          logger.error('Failed to rewind OpenCode session', error, {
            sessionId,
            messageId,
            targetMessageId: target.messageId,
          });
        }
      })();
    },
    [sessionId, status, visibleMessages]
  );

  const handlePermissionApprove = useCallback(
    (requestId: string, always?: boolean): void => {
      void handlePermissionReply(requestId, always ? 'always' : 'once');
    },
    [handlePermissionReply]
  );

  const handlePermissionDeny = useCallback(
    (requestId: string): void => {
      void handlePermissionReply(requestId, 'reject');
    },
    [handlePermissionReply]
  );

  return {
    sessionId,
    messages: displayedMessages,
    pendingPermissions,
    questions,
    isAgentRunning: isAgentBusy,
    sessionUsage,
    handleSend,
    handleStop,
    handleRewind,
    handlePermissionApprove,
    handlePermissionDeny,
    handleQuestionReply,
    handleQuestionReject,
    handleOpenFile: open.handleOpenFile,
    handleOpenUrl: open.handleOpenUrl,
  };
}
