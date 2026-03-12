import { createLogger } from '@orbit/common/lib';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { createChatOpenHandlers } from './handlers/chat-actions';
import { useOcChat } from './use-oc-chat';
import { useOcStreamingReveal } from './use-oc-streaming-reveal';

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
import { useOcPermissionStore, useOcProviderStore, useOcSessionStore } from '@/stores/opencode';

type OcRenderedMessage = ReturnType<typeof useOcChat>['messages'][number];

const logger = createLogger('OcChatAdapter');

interface AdaptedOcParts {
  content: string;
  thinkingBlocks: ThinkingBlock[];
  tools: ToolExecution[];
  interruptReason?: string;
  isInterrupted: boolean;
  isThinkingActive: boolean;
}

interface AdaptedOcMessage {
  chat: ChatMessage;
  tools: ToolExecution[];
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

function appendBlock(content: string, block: string): string {
  if (content.length === 0) {
    return block;
  }

  return `${content}\n\n${block}`;
}

function getToolInput(part: Extract<OcPart, { type: 'tool' }>): Record<string, unknown> {
  const input = { ...part.state.input };
  const meta = 'metadata' in part.state ? part.state.metadata : undefined;
  const todos = meta?.['todos'];

  if ((part.tool === 'todowrite' || part.tool === 'todoread') && Array.isArray(todos)) {
    return {
      ...input,
      todos,
    };
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
  const thinkingBlocks: ThinkingBlock[] = [];
  const tools: ToolExecution[] = [];

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

      case 'step-finish': {
        const tokens = part.tokens.total ?? part.tokens.input + part.tokens.output;
        content = appendBlock(
          content,
          `---\n*Step finished (${part.reason}, ${String(tokens)} tokens)*`
        );
        break;
      }

      case 'compaction':
        content = appendBlock(content, '---\n*Context compacted*');
        break;

      case 'retry':
        interruptReason = `Retry #${String(part.attempt)}`;
        isInterrupted = true;
        break;

      case 'file': {
        const file = part.filename ?? part.source?.path ?? part.url;
        content = appendLine(content, `Referenced: ${file}`);
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
    ...(interruptReason !== undefined ? { interruptReason } : {}),
    isInterrupted,
    isThinkingActive,
  };
}

export function buildOcSessionUsage(messages: OcRenderedMessage[]): UsageData {
  return messages.reduce<UsageData>(
    (usage, entry) => {
      if (entry.message.role !== 'assistant') {
        return usage;
      }

      const tokens = entry.message.tokens;

      return {
        inputTokens: usage.inputTokens + tokens.input,
        outputTokens: usage.outputTokens + tokens.output,
        cacheReadInputTokens: usage.cacheReadInputTokens + tokens.cache.read,
        cacheCreationInputTokens: usage.cacheCreationInputTokens + tokens.cache.write,
        totalCostUsd: usage.totalCostUsd + entry.message.cost,
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
      } else if (
        (prev === 'pending' || prev === 'running') &&
        (tool.status === 'success' || tool.status === 'error')
      ) {
        actions.completeTool(tool.id, tool.toolOutput, tool.status === 'success');
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
      ...(adapted.isThinkingActive ? { isThinkingActive: true } : {}),
      ...(assistant?.parentID ? { parentUuid: assistant.parentID } : {}),
      ...(interruptReason !== undefined ? { interruptReason } : {}),
    },
    tools: adapted.tools,
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
    images?: unknown[],
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
    });
  }, [adapted]);

  useEffect(() => {
    return () => {
      syncedRef.current.clear();
    };
  }, []);

  const sessionUsage = useMemo(() => buildOcSessionUsage(visibleMessages), [visibleMessages]);
  const pendingPermissions = useMemo(() => permissions.map(adaptPermission), [permissions]);
  const chatMessages = useMemo(() => adapted.map((entry) => entry.chat), [adapted]);
  const displayedMessages = useOcStreamingReveal(chatMessages);
  const open = useMemo(() => createChatOpenHandlers({ postMessage }), [postMessage]);

  const handleSend = useCallback(
    (text: string): void => {
      void send(text, {
        agent,
        ...(providerId ? { providerId } : {}),
        ...(modelId ? { modelId } : {}),
        ...(variant ? { variant } : {}),
      });
    },
    [agent, modelId, providerId, send, variant]
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
