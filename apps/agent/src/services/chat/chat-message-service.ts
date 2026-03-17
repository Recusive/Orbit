/**
 * Chat Message Service — Singleton that handles ALL chat backend events.
 *
 * Replaces the `createMessageHandler` closure from message-handler.ts.
 * Same logic, but writes to ChatStore instead of React setState.
 *
 * KEY ARCHITECTURAL DECISIONS:
 * 1. Text chunks are applied immediately for cadence fidelity. Thinking/tool events
 *    still use per-session RAF batchers — rewind on session A cancels only A's batchers.
 *    Batcher maps are created lazily and deleted on agent:complete / destroySession.
 * 2. Store interactions via getState() — reads/writes ChatStore, ToolStore,
 *    CheckpointStore, FileStore, UIStore at call time (not captured deps).
 * 3. startTransition imported from 'react' — works outside React components.
 *    IMPORTANT: This works because Zustand v4+ uses useSyncExternalStore internally.
 *    Do NOT downgrade Zustand below v4 without verifying startTransition still works.
 * 4. handleMessage() wraps dispatch in try-catch with structured error logging per
 *    session. Errors never propagate to the caller (use-tauri-message-listener).
 *
 * [warning] TESTED: The title remap and retry paths in this service are covered by
 * integration tests. If you modify this, run: bun run test -- title-remap-and-retry
 * Test file: src/__tests__/services/chat/title-remap-and-retry.test.ts
 */
import { createLogger } from '@orbit/common/lib';
import { startTransition } from 'react';

import type { ChatMessage, ThinkingBlock } from '@/components/chat';
import type { RafBatchHandler } from '@/lib/utils/event-batcher';
import type { ExtensionMessage } from '@/types/protocol';

import { getActiveChain } from '@/components/chat/messages/message-utils';
import { recordBrowserActivityFromAI } from '@/hooks/agent/handlers/browser-handlers';
import { remapCreatedSession } from '@/hooks/agent/use-tauri-session';
import { conversationAddMessage, conversationList, conversationLoad } from '@/lib/api';
import { toCachedImagePreviewUrl } from '@/lib/api/image-cache';
import { wasMessagePersisted } from '@/lib/conversation-persistence';
import { serializeThinkingBlocks, toConversationSummaries } from '@/lib/mappers';
import { AGENT_RUNNING_CLEAR_DELAY_MS } from '@/lib/utils/constants';
import { computeSimpleDiff, getLanguageFromPath } from '@/lib/utils/diff-utils';
import { createCheckpointBatcher, rafBatch } from '@/lib/utils/event-batcher';
import { StreamingRevealController } from '@/services/chat/streaming-reveal-controller';
import {
  clearSessionTitleState,
  flushPendingTitle,
  generateAITitle,
  getPreferredTitle,
  remapSessionTitleState,
  retryPendingPersistence,
} from '@/services/session';
import { useCheckpointStore } from '@/stores/agent/checkpoint-store';
import { useMessageBufferStore } from '@/stores/agent/message-buffer-store';
import { useToolStore } from '@/stores/agent/tool-store';
import { useChatStore } from '@/stores/chat/chat-store';
import { useFileStore } from '@/stores/file/file-store';
import { useFileViewerStore } from '@/stores/file/file-viewer-store';
import { useUIStore } from '@/stores/ui/ui-store';

const logger = createLogger('ChatMessageService');

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

/** When cancelling a RAF batcher, flush=true processes pending items before clearing. */
const FLUSH_PENDING = true;

// ────────────────────────────────────────────────────────────────────────────
// Event Types (internal to service)
// ────────────────────────────────────────────────────────────────────────────

interface TextChunkEvent {
  messageId: string;
  content: string;
}

interface ThinkingChunkEvent {
  messageId: string;
  thinking: string;
}

interface ToolStartEvent {
  type: 'start';
  toolId: string;
  messageId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  contentOffset: number;
}

interface ToolEndEvent {
  type: 'end';
  toolId: string;
  toolOutput: unknown;
  success: boolean;
}

type ToolEvent = ToolStartEvent | ToolEndEvent;

// ────────────────────────────────────────────────────────────────────────────
// Sidebar Refresh Coalescing
// ────────────────────────────────────────────────────────────────────────────

let sidebarDirty = false;
let sidebarIdleCallbackId: number | null = null;

function scheduleSidebarRefresh(): void {
  sidebarDirty = true;
  if (sidebarIdleCallbackId !== null) return; // Already scheduled

  const callback = (): void => {
    sidebarIdleCallbackId = null;
    if (!sidebarDirty) return;
    sidebarDirty = false;

    const { workspacePath } = useUIStore.getState();
    if (!workspacePath) return;

    void conversationList(workspacePath)
      .then((conversations) => {
        useUIStore.getState().setConversations(toConversationSummaries(conversations));
      })
      .catch((err: unknown) => {
        logger.error('Failed to refresh conversation list', err);
      });
  };

  if (typeof requestIdleCallback === 'function') {
    sidebarIdleCallbackId = requestIdleCallback(callback);
  } else {
    // Fallback for environments without requestIdleCallback
    sidebarIdleCallbackId = window.setTimeout(callback, 100);
  }
}

function mapPersistedMessage(m: {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string | undefined;
  thinkingDurationMs?: number | undefined;
  thinkingPhases?:
    | {
        content: string;
        contentOffset?: number | undefined;
        ordinal?: number | undefined;
        durationMs?: number | undefined;
      }[]
    | undefined;
  isInterrupted?: boolean | undefined;
  turnDurationMs?: number | undefined;
  parentUuid?: string | null | undefined;
  toolUses?: { name: string; success: boolean }[] | undefined;
  attachedImages?:
    | {
        name: string;
        mimeType: string;
        previewUrl: string;
      }[]
    | undefined;
}): ChatMessage {
  const thinkingPhases = m.thinkingPhases ?? [];
  const thinkingBlocks: ThinkingBlock[] | undefined =
    thinkingPhases.length > 0
      ? thinkingPhases.map((phase, index) => ({
          content: phase.content,
          durationMs:
            phase.durationMs ??
            (index === thinkingPhases.length - 1 ? (m.thinkingDurationMs ?? 0) : 0),
          contentOffset: phase.contentOffset,
          ordinal: phase.ordinal,
        }))
      : m.thinking
        ? [{ content: m.thinking, durationMs: m.thinkingDurationMs ?? 0 }]
        : undefined;

  const base: ChatMessage = {
    id: m.id,
    role: m.role,
    content: m.content,
    displayedContent: m.content,
    ...(m.parentUuid !== undefined ? { parentUuid: m.parentUuid } : {}),
    ...(thinkingBlocks ? { thinkingBlocks } : {}),
    ...(m.thinking ? { thinking: m.thinking } : {}),
    ...(m.thinkingDurationMs !== undefined ? { thinkingDurationMs: m.thinkingDurationMs } : {}),
    ...(m.turnDurationMs !== undefined ? { turnDurationMs: m.turnDurationMs } : {}),
    ...(m.attachedImages && m.attachedImages.length > 0
      ? {
          attachedImages: m.attachedImages.map((image) => ({
            name: image.name,
            mimeType: image.mimeType,
            previewUrl: toCachedImagePreviewUrl(image.previewUrl),
          })),
        }
      : {}),
  };

  if (m.isInterrupted === true) {
    const hasRejectedQuestion = m.toolUses?.some(
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

// ────────────────────────────────────────────────────────────────────────────
// Service Class
// ────────────────────────────────────────────────────────────────────────────

class ChatMessageService {
  // Text chunks are applied immediately; thinking/tool events stay RAF-batched.
  private chunkBatchers = new Map<string, RafBatchHandler<TextChunkEvent>>();
  private thinkingBatchers = new Map<string, RafBatchHandler<ThinkingChunkEvent>>();
  private toolBatchers = new Map<string, RafBatchHandler<ToolEvent>>();

  // Per-message tracking
  private pendingChunkLengths = new Map<string, number>();
  private thinkingStartTimes = new Map<string, number>();
  private markerOrdinals = new Map<string, number>();

  // Track whether the current turn used tools (for re-asserting isAgentRunning on tool:start)
  private turnHadTools = new Map<string, boolean>();
  // Safety timers for delayed isAgentRunning cleanup.
  private agentRunningTimers = new Map<string, ReturnType<typeof setTimeout>>();
  // Due timestamps for delayed clears (needed for session remap with remaining delay).
  private agentRunningTimerDueAt = new Map<string, number>();

  /** Word-by-word reveal controller for streaming messages. */
  private revealController = new StreamingRevealController();

  // Checkpoint batching — debounces rapid checkpoint events (100ms window)
  // Reduces ~30 checkpoint state updates per agent run to ~2-3
  private batchedCheckpoint = createCheckpointBatcher((sessionId, checkpointId) => {
    useCheckpointStore.getState().onCheckpointReceived(sessionId, checkpointId);
  }, 100);

  // ══════════════════════════════════════════════════════════════════════
  // Public API
  // ══════════════════════════════════════════════════════════════════════

  handleMessage(message: ExtensionMessage): void {
    try {
      this.dispatch(message);
    } catch (error) {
      const sessionId = 'session_id' in message ? message.session_id : 'unknown';
      logger.error('ChatMessageService: unhandled error', {
        sessionId,
        type: message.type,
        error,
      });
    }
  }

  /** Cancel a pending delayed isAgentRunning clear for a session.
   *  Called when new events arrive, proving the agent is still active. */
  private cancelAgentRunningTimer(sessionId: string): void {
    const timer = this.agentRunningTimers.get(sessionId);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.agentRunningTimers.delete(sessionId);
      this.agentRunningTimerDueAt.delete(sessionId);
    }
  }

  /** Schedule delayed clear of isAgentRunning and stop-pending state. */
  private scheduleAgentRunningClear(sessionId: string, delayMs: number): void {
    this.cancelAgentRunningTimer(sessionId);
    const dueAt = Date.now() + delayMs;
    const timer = setTimeout(() => {
      this.agentRunningTimers.delete(sessionId);
      this.agentRunningTimerDueAt.delete(sessionId);
      useChatStore.getState().setAgentRunning(sessionId, false);
      useChatStore.getState().setStopPending(sessionId, false);
    }, delayMs);
    this.agentRunningTimers.set(sessionId, timer);
    this.agentRunningTimerDueAt.set(sessionId, dueAt);
  }

  /** Flush all pending batchers for a session (call on agent:complete). */
  flushSession(sessionId: string): void {
    this.chunkBatchers.get(sessionId)?.cancel(FLUSH_PENDING);
    this.thinkingBatchers.get(sessionId)?.cancel(FLUSH_PENDING);
    this.toolBatchers.get(sessionId)?.cancel(FLUSH_PENDING);
  }

  /** Cancel all pending batchers for a session without flushing (call on rewind). */
  cancelSession(sessionId: string): void {
    this.chunkBatchers.get(sessionId)?.cancel();
    this.thinkingBatchers.get(sessionId)?.cancel();
    this.toolBatchers.get(sessionId)?.cancel();
    this.revealController.stopAll(sessionId);
  }

  /** Full cleanup for a session — cancel batchers, timers, delete from Maps. */
  destroySession(sessionId: string): void {
    this.cancelSession(sessionId);
    this.cleanupBatchers(sessionId);
    this.cancelAgentRunningTimer(sessionId);
    this.turnHadTools.delete(sessionId);
  }

  /** Cancel all batchers and timers across all sessions (for HMR cleanup). */
  destroyAll(): void {
    for (const [, batcher] of this.chunkBatchers) batcher.cancel();
    for (const [, batcher] of this.thinkingBatchers) batcher.cancel();
    for (const [, batcher] of this.toolBatchers) batcher.cancel();
    for (const [, timer] of this.agentRunningTimers) clearTimeout(timer);
    this.chunkBatchers.clear();
    this.thinkingBatchers.clear();
    this.toolBatchers.clear();
    this.pendingChunkLengths.clear();
    this.thinkingStartTimes.clear();
    this.markerOrdinals.clear();
    this.agentRunningTimers.clear();
    this.agentRunningTimerDueAt.clear();
    this.revealController.destroyAll();
    this.turnHadTools.clear();
  }

  finalizeInterruptedMessage(message: ChatMessage): ChatMessage {
    if (
      message.isThinkingActive !== true ||
      message.thinkingBlocks === undefined ||
      message.thinkingBlocks.length === 0
    ) {
      return message;
    }

    const blocks = [...message.thinkingBlocks];
    const lastBlock = blocks[blocks.length - 1];
    if (!lastBlock) {
      return message;
    }

    const startTime = this.thinkingStartTimes.get(message.id);
    const finalDuration = startTime !== undefined ? Date.now() - startTime : lastBlock.durationMs;

    blocks[blocks.length - 1] = {
      ...lastBlock,
      ...(lastBlock.contentOffset === undefined ? { contentOffset: message.content.length } : {}),
      durationMs: finalDuration,
    };

    this.thinkingStartTimes.delete(message.id);

    return {
      ...message,
      isThinkingActive: false,
      thinkingBlocks: blocks,
    };
  }

  private nextMarkerOrdinal(messageId: string): number {
    const next = this.markerOrdinals.get(messageId) ?? 0;
    this.markerOrdinals.set(messageId, next + 1);
    return next;
  }

  private clearMarkerOrdinal(messageId: string): void {
    this.markerOrdinals.delete(messageId);
  }

  // ══════════════════════════════════════════════════════════════════════
  // Event Dispatch
  // ══════════════════════════════════════════════════════════════════════

  private dispatch(message: ExtensionMessage): void {
    switch (message.type) {
      case 'system:init':
        this.handleSystemInit(message);
        break;
      case 'agent:chunk':
        this.handleAgentChunk(message);
        break;
      case 'agent:thinking':
        this.handleAgentThinking(message);
        break;
      case 'agent:complete':
        this.handleAgentComplete(message);
        break;
      case 'agent:error':
        this.handleAgentError(message);
        break;
      case 'agent:checkpoint':
        this.handleAgentCheckpoint(message);
        break;
      case 'agent:compact_complete':
        this.handleCompactComplete(message);
        break;
      case 'conversation:created':
        this.handleConversationCreated(message);
        break;
      case 'conversation:list':
        this.handleConversationList(message);
        break;
      case 'conversation:loading':
        this.handleConversationLoading();
        break;
      case 'conversation:loaded':
        this.handleConversationLoaded(message);
        break;
      case 'conversation:rewound':
        this.handleConversationRewound(message);
        break;
      case 'conversation:deleted':
        this.handleConversationDeleted(message);
        break;
      case 'tool:start':
        this.handleToolStart(message);
        break;
      case 'tool:end':
        this.handleToolEnd(message);
        break;
      case 'permission:request':
        this.handlePermissionRequest(message);
        break;
      case 'inputMode:changed':
        this.handleInputModeChanged(message);
        break;
      case 'model:changed':
        this.handleModelChanged(message);
        break;
      case 'file:content':
        this.handleFileContent(message);
        break;

      // ── Non-chat events handled by other subsystems (no-op here) ────────
      case 'error':
      case 'layout':
      case 'agent:plan_mode':
      case 'agent:accept_mode':
      case 'thinking:changed':
      case 'panel:command':
      case 'panel:visible':
      case 'terminal:output':
      case 'terminal:data':
      case 'terminal:created':
      case 'terminal:exited':
      case 'terminal:foreground':
      case 'terminal:cwd':
      case 'terminal:command:start':
      case 'terminal:command:end':
      case 'terminal:capabilities':
      case 'terminal:title':
      case 'file:changed':
      case 'file:written':
      case 'file:tree:response':
      case 'file:tree:error':
      case 'browser:created':
      case 'browser:detected':
      case 'browser:navigated':
      case 'browser:element-selected':
      case 'browser:loading':
      case 'browser:error':
      case 'browser:cleared':
      case 'browser:open':
      case 'browser:close':
      case 'browser:tool_request':
      case 'subagents:list:response':
      case 'subagents:created':
      case 'subagents:updated':
      case 'subagents:deleted':
      case 'subagents:error':
      case 'subagents:generated':
      case 'commands:list:response':
      case 'commands:created':
      case 'commands:updated':
      case 'commands:deleted':
      case 'commands:error':
      case 'commands:generated':
      case 'skills:list:response':
      case 'skills:error':
        break;
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // System Init (Session Remap)
  // ══════════════════════════════════════════════════════════════════════

  /** Migrate delayed running clear state across session ID remaps. */
  private remapRunningState(oldSid: string, newSid: string): void {
    const hadTools = this.turnHadTools.get(oldSid);
    if (hadTools !== undefined) {
      this.turnHadTools.delete(oldSid);
      this.turnHadTools.set(newSid, hadTools);
    }

    const oldDueAt = this.agentRunningTimerDueAt.get(oldSid);
    // Callbacks close over session ID, so old timer must be canceled.
    this.cancelAgentRunningTimer(oldSid);

    if (oldDueAt !== undefined) {
      const remaining = Math.max(0, oldDueAt - Date.now());
      this.scheduleAgentRunningClear(newSid, remaining);
    }
  }

  private handleSystemInit(message: Extract<ExtensionMessage, { type: 'system:init' }>): void {
    const sdkSessionId = message.sdk_session_id;
    const chatStore = useChatStore.getState();
    // Determine which frontend session to remap to the SDK session ID.
    //
    // Prefer message.session_id when it differs from sdk_session_id — this is the
    // original orbit session ID preserved by agent-bridge. It's reliable even if the
    // user switches sessions between sending and system:init arriving.
    //
    // Fallback to activeSessionId for backwards compat: older agent-bridge versions
    // send session_id === sdk_session_id (both the SDK ID) because the local variable
    // was reassigned before the event fired. In that case, activeSessionId is the only
    // way to find the frontend session. This fallback works correctly as long as the
    // user hasn't switched sessions in the ~50-200ms between send and system:init.
    const frontendSessionId =
      message.session_id && message.session_id !== sdkSessionId
        ? message.session_id
        : chatStore.activeSessionId;

    // LEGACY REMAP PATH: Since SDK v0.2.44, new sessions pass `options.sessionId`
    // in agent-bridge's _createOptions(), so the SDK uses Orbit's UUID directly and
    // this entire block is skipped (IDs match). This remap cascade is still required for:
    //   1. Forks/rewinds — SDK generates a new UUID for the forked JSONL
    //   2. Sessions created before the custom sessionId feature was added
    if (sdkSessionId && frontendSessionId && sdkSessionId !== frontendSessionId) {
      logger.info(
        `system:init — session IDs differ (frontend=${frontendSessionId}, sdk=${sdkSessionId}), remapping`
      );
      // Remap session in ChatStore (atomically moves data, updates activeSessionId if active)
      useChatStore.getState().remapSession(frontendSessionId, sdkSessionId);

      // Update createdSessions so ensureSession() recognises the new ID
      remapCreatedSession(frontendSessionId, sdkSessionId);

      // Migrate external stores
      useToolStore.getState().remapSession(frontendSessionId, sdkSessionId);
      useCheckpointStore.getState().remapSession(frontendSessionId, sdkSessionId);
      // Consume pending conversation fork (clears checkpoint store state for this session).
      // Must use sdkSessionId because remapSession() above moved the data from frontendSessionId.
      useCheckpointStore.getState().consumePendingConversationFork(sdkSessionId);

      // Mark load pending to prevent redundant conversation:load
      useMessageBufferStore.getState().markLoadPending(sdkSessionId);

      // Remap the sidebar entry in-place: swap sessionId from frontendId → sdkId.
      // This keeps the entry visible during streaming instead of removing it and
      // waiting for conversation:list to re-add it after agent:complete.
      useUIStore.getState().remapConversation(frontendSessionId, sdkSessionId);
      // Migrate service-owned in-flight state (timers + tool flags).
      this.remapRunningState(frontendSessionId, sdkSessionId);
      remapSessionTitleState(frontendSessionId, sdkSessionId);

      // Only update UI navigation if the user is still on this session.
      // remapSession() already conditionally updates activeSessionId in ChatStore
      // (line 357-361 of chat-store.ts). If user navigated away, don't yank them back.
      const isStillActive = useChatStore.getState().activeSessionId === sdkSessionId;
      if (isStillActive) {
        useToolStore.getState().switchSession(sdkSessionId);
      }
    } else if (sdkSessionId && frontendSessionId && sdkSessionId === frontendSessionId) {
      // Session IDs match — custom sessionId was used, no remap needed
      logger.info('system:init — session IDs match, skipping remap (custom sessionId)');
    } else if (
      !chatStore.activeSessionId ||
      (chatStore.sessions[chatStore.activeSessionId]?.messages.length ?? 0) === 0
    ) {
      // No active session yet — adopt whatever session_id we received
      useChatStore.getState().setActiveSession(message.session_id);
    }

    // Set workspace if we don't already have one
    const uiState = useUIStore.getState();
    if (message.cwd && !uiState.workspacePath) {
      uiState.initializeWorkspace(message.cwd);
      // Load conversations for this workspace
      void conversationList(message.cwd)
        .then((conversations) => {
          useUIStore.getState().setConversations(toConversationSummaries(conversations));
        })
        .catch((err: unknown) => {
          logger.error('Failed to load conversation list', err);
        });
    }

    // Flush pending title now that the JSONL file is guaranteed to exist.
    // The effective session ID (JSONL filename) is sdkSessionId; the pending title
    // was stored under the original frontend session ID (message.session_id).
    const effectiveId = sdkSessionId ?? message.session_id;
    flushPendingTitle(
      effectiveId,
      message.session_id !== effectiveId ? message.session_id : undefined
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // Streaming Handlers
  // ══════════════════════════════════════════════════════════════════════

  private handleAgentChunk(message: Extract<ExtensionMessage, { type: 'agent:chunk' }>): void {
    const sid = message.session_id;

    // New turn event — cancel any pending delayed clear from a previous tool-using turn.
    this.cancelAgentRunningTimer(sid);

    if (!message.message_id) {
      logger.error(
        `CRITICAL: Chunk received without message_id - content will be lost. ` +
          `Session: ${sid}, Length: ${String(message.content.length)}, ` +
          `Preview: "${message.content.slice(0, 50)}...". Check agent-bridge batching.`
      );
      // Append error indicator to last message in store
      const store = useChatStore.getState();
      const session = store.sessions[sid];
      if (session) {
        const lastMsg = session.messages.at(-1);
        const errorMsg = '[Some content may be missing due to a streaming error]';
        if (lastMsg?.role === 'assistant' && !lastMsg.content.includes(errorMsg)) {
          useChatStore.getState().updateMessage(sid, lastMsg.id, (m) => ({
            ...m,
            content: m.content + `\n\n${errorMsg}`,
            displayedContent: m.content + `\n\n${errorMsg}`,
          }));
        }
      }
      return;
    }

    // Track pending chunk length for accurate tool placement
    const pending = this.pendingChunkLengths.get(message.message_id) ?? 0;
    this.pendingChunkLengths.set(message.message_id, pending + message.content.length);

    const batcher = this.getOrCreateChunkBatcher(sid);
    batcher({ messageId: message.message_id, content: message.content });
  }

  private handleAgentThinking(
    message: Extract<ExtensionMessage, { type: 'agent:thinking' }>
  ): void {
    // New turn event — cancel any pending delayed clear from a previous tool-using turn.
    this.cancelAgentRunningTimer(message.session_id);

    // Record thinking start time on first chunk
    if (!this.thinkingStartTimes.has(message.message_id)) {
      this.thinkingStartTimes.set(message.message_id, Date.now());
    }

    const batcher = this.getOrCreateThinkingBatcher(message.session_id);
    batcher({ messageId: message.message_id, thinking: message.thinking });
  }

  private handleAgentComplete(
    message: Extract<ExtensionMessage, { type: 'agent:complete' }>
  ): void {
    const sid = message.session_id;

    // Flush all pending batchers BEFORE marking message as complete
    this.flushSession(sid);
    // Clean up batcher Map entries (recreated lazily if session streams again)
    this.cleanupBatchers(sid);

    // Accelerated drain — reveal remaining words at 10ms/word.
    // When drain finishes, callback sets isStreaming: false (shimmer + content stay in sync).
    this.revealController.beginDrain(sid, message.message_id, () => {
      useChatStore.getState().updateMessage(sid, message.message_id, (m) => ({
        ...m,
        isStreaming: false,
      }));
    });

    // Clean up pending chunk tracking for this message
    this.pendingChunkLengths.delete(message.message_id);
    this.clearMarkerOrdinal(message.message_id);

    // Calculate final thinking duration
    const thinkingStart = this.thinkingStartTimes.get(message.message_id);
    const finalThinkingDuration =
      thinkingStart !== undefined ? Date.now() - thinkingStart : undefined;
    this.thinkingStartTimes.delete(message.message_id);

    const store = useChatStore.getState();
    const session = store.sessions[sid];
    if (!session) return;

    const lastMsg = session.messages.at(-1);
    if (lastMsg?.role === 'assistant' && lastMsg.isStreaming) {
      // Finalize last thinking block duration
      let finalBlocks = lastMsg.thinkingBlocks;
      if (
        finalBlocks !== undefined &&
        finalBlocks.length > 0 &&
        finalThinkingDuration !== undefined &&
        lastMsg.isThinkingActive === true
      ) {
        finalBlocks = [...finalBlocks];
        const lastBlock = finalBlocks[finalBlocks.length - 1];
        if (lastBlock !== undefined) {
          finalBlocks[finalBlocks.length - 1] = {
            ...lastBlock,
            durationMs: finalThinkingDuration,
            contentOffset: lastMsg.content.length,
          };
        }
      }

      const completedMsg: ChatMessage = {
        ...lastMsg,
        // isStreaming stays true — drain callback sets false when all words are revealed
        isThinkingActive: false,
        ...(finalThinkingDuration !== undefined && lastMsg.thinking
          ? { thinkingDurationMs: finalThinkingDuration }
          : {}),
        ...(finalBlocks !== undefined ? { thinkingBlocks: finalBlocks } : {}),
      };

      // Persist assistant message to backend
      const usageDto = message.usage
        ? {
            inputTokens: message.usage.input_tokens,
            outputTokens: message.usage.output_tokens,
            ...(message.usage.cache_read_input_tokens !== undefined
              ? { cacheReadInputTokens: message.usage.cache_read_input_tokens }
              : {}),
            ...(message.usage.cache_creation_input_tokens !== undefined
              ? { cacheCreationInputTokens: message.usage.cache_creation_input_tokens }
              : {}),
            ...(message.total_cost_usd !== undefined
              ? { totalCostUsd: message.total_cost_usd }
              : {}),
          }
        : undefined;

      // Get completed tools for persistence
      const toolState = useToolStore.getState();
      const messageTools = toolState.getToolsForMessage(completedMsg.id);
      const toolUsesDto =
        messageTools.length > 0
          ? messageTools.map((tool) => ({
              id: tool.id,
              name: tool.toolName,
              input: tool.toolInput,
              ...(tool.toolOutput !== undefined
                ? {
                    output:
                      typeof tool.toolOutput === 'string'
                        ? tool.toolOutput
                        : JSON.stringify(tool.toolOutput),
                  }
                : {}),
              success: tool.success ?? true,
              ...(tool.contentOffset !== undefined ? { contentOffset: tool.contentOffset } : {}),
              ...(tool.ordinal !== undefined ? { ordinal: tool.ordinal } : {}),
            }))
          : undefined;

      const { workspacePath, activeWorktreePath } = useUIStore.getState();
      const thinkingPhasesDto = serializeThinkingBlocks(completedMsg.thinkingBlocks);

      if (!wasMessagePersisted(sid, completedMsg.id)) {
        void conversationAddMessage(
          sid,
          {
            id: completedMsg.id,
            role: 'assistant',
            content: completedMsg.content,
            ...(completedMsg.thinking ? { thinking: completedMsg.thinking } : {}),
            ...(completedMsg.thinkingDurationMs !== undefined
              ? { thinkingDurationMs: completedMsg.thinkingDurationMs }
              : {}),
            ...(thinkingPhasesDto ? { thinkingPhases: thinkingPhasesDto } : {}),
            createdAt: Date.now(),
            ...(usageDto ? { usage: usageDto } : {}),
            ...(toolUsesDto ? { toolUses: toolUsesDto } : {}),
            ...(completedMsg.parentUuid !== undefined
              ? { parentUuid: completedMsg.parentUuid }
              : {}),
          },
          workspacePath ?? undefined,
          activeWorktreePath ?? undefined
        );
      }

      // Replace last message with completed version
      useChatStore.getState().updateMessage(sid, lastMsg.id, () => completedMsg);
    }

    // Track usage data from SDK
    if (message.usage) {
      useToolStore.getState().addUsage(
        message.message_id,
        {
          input_tokens: message.usage.input_tokens,
          output_tokens: message.usage.output_tokens,
          ...(message.usage.cache_read_input_tokens !== undefined
            ? { cache_read_input_tokens: message.usage.cache_read_input_tokens }
            : {}),
          ...(message.usage.cache_creation_input_tokens !== undefined
            ? { cache_creation_input_tokens: message.usage.cache_creation_input_tokens }
            : {}),
        },
        message.total_cost_usd
      );
    }

    // Mark checkpoint completion (associates checkpoint with the user message)
    useCheckpointStore.getState().onMessageComplete(sid);

    // The SDK sends a 'result' message after each tool-use round-trip within a
    // single sendMessage() call, not just once at the very end. This means
    // agent:complete can be intermediate during multi-tool runs.
    //
    // result_subtype is the SDK's SDKResultMessage.subtype:
    //   "success"                              → normal completion
    //   "error_max_turns" / "error_during_execution" / etc. → error completion
    // Intermediate result subtype values are SDK/version dependent — keep the
    // hadTools fallback as the source of truth for delayed clear behavior.
    this.forceCompleteOrphanedTools(sid);
    this.cancelAgentRunningTimer(sid);
    const hadTools = this.turnHadTools.get(sid) === true;
    this.turnHadTools.set(sid, false);
    logger.debug('agent:complete', { sessionId: sid, subtype: message.result_subtype, hadTools });

    if (hadTools) {
      // Multi-tool flow: keep running state through intermediate result gaps.
      this.scheduleAgentRunningClear(sid, AGENT_RUNNING_CLEAR_DELAY_MS);
    } else {
      // Text-only flow or final pass without tool usage: clear immediately.
      useChatStore.getState().setAgentRunning(sid, false);
      useChatStore.getState().setStopPending(sid, false);
    }

    // Schedule coalesced sidebar refresh
    scheduleSidebarRefresh();

    // Retry AI title generation after a completed turn if the send-time attempt failed.
    // This still uses only the first user message so the title is deterministic from
    // send-time input rather than assistant output.
    {
      const currentSession = useChatStore.getState().sessions[sid];
      if (currentSession) {
        const msgs = currentSession.messages;
        const userMsgs = msgs.filter((m) => m.role === 'user');
        if (userMsgs.length >= 1) {
          const userText = userMsgs[0]?.content ?? '';
          if (userText.length > 0) {
            generateAITitle(sid, userText);
          }
        }
      }
    }

    retryPendingPersistence(sid);
  }

  private handleAgentError(message: Extract<ExtensionMessage, { type: 'agent:error' }>): void {
    const sid = message.session_id;

    // Flush pending batchers before handling error
    this.flushSession(sid);
    this.cleanupBatchers(sid);
    // Errors are instant — snap displayedContent to full content
    this.revealController.stopAll(sid);
    this.pendingChunkLengths.delete(message.message_id);
    this.clearMarkerOrdinal(message.message_id);

    // Errors are always terminal — clear immediately, cancel any delayed clear
    this.forceCompleteOrphanedTools(sid);
    this.cancelAgentRunningTimer(sid);
    this.turnHadTools.delete(sid);
    useChatStore.getState().setAgentRunning(sid, false);
    useChatStore.getState().setStopPending(sid, false);
    retryPendingPersistence(sid);

    // Detect auth-related errors
    const rawError = message.error;
    const isAuthError =
      /no credentials found|oauth.*token|auth(?:entication|orization)?\s+(?:failed|error)|unauthorized/i.test(
        rawError
      );
    const errorContent = isAuthError
      ? 'Error: Authentication failed. Please run `claude login` in your terminal to re-authenticate.'
      : `Error: ${rawError}`;

    const store = useChatStore.getState();
    const session = store.sessions[sid];
    if (!session) return;

    const lastMsg = session.messages.at(-1);
    if (lastMsg?.role === 'assistant') {
      // Append error to existing assistant message
      const newContent = lastMsg.content ? `${lastMsg.content}\n\n${errorContent}` : errorContent;
      useChatStore.getState().updateMessage(sid, lastMsg.id, (m) => ({
        ...m,
        content: newContent,
        displayedContent: newContent,
        isStreaming: false,
      }));
    } else {
      // Create new error message
      const parentUuid = session.messages.at(-1)?.id ?? null;
      useChatStore.getState().addMessage(sid, {
        id: message.message_id,
        role: 'assistant',
        content: errorContent,
        displayedContent: errorContent,
        parentUuid,
      });
    }
  }

  private handleAgentCheckpoint(
    message: Extract<ExtensionMessage, { type: 'agent:checkpoint' }>
  ): void {
    const { session_id: checkpointSessionId, checkpoint_id } = message;

    // Batch checkpoint events for file rewind (debounced 100ms)
    // Uses "delayed association" — each message gets the checkpoint from the NEXT user message
    this.batchedCheckpoint(checkpointSessionId, checkpoint_id);

    // Reconcile user message IDs: frontend UUID → SDK UUID
    const checkpointState = useCheckpointStore.getState();
    const oldFrontendId = checkpointState.reconcileUserMessageId(
      checkpointSessionId,
      checkpoint_id
    );

    if (oldFrontendId) {
      useChatStore.getState().reconcileMessageId(checkpointSessionId, oldFrontendId, checkpoint_id);
    }
  }

  private handleCompactComplete(
    message: Extract<ExtensionMessage, { type: 'agent:compact_complete' }>
  ): void {
    const { session_id } = message;
    logger.info(`Context compaction completed (bridge event) for session ${session_id}`);
    const entry = useChatStore.getState().activeCompactions[session_id];
    if (entry?.backend === 'claude') {
      useChatStore.getState().settleCompaction(session_id);
    }

    // The SDK rewrites the JSONL asynchronously after compact_boundary fires.
    // Retry with backoff to handle slow machines where the SDK hasn't finished writing.
    void this.reloadConversationWithRetry(session_id);
  }

  /** Reload compacted conversation with retry and backoff. */
  private async reloadConversationWithRetry(sessionId: string): Promise<void> {
    const delays = [500, 1000, 2000];
    for (let attempt = 0; attempt < delays.length; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
      try {
        await this.reloadConversationFromDisk(sessionId);
        return; // Success — stop retrying
      } catch {
        if (attempt < delays.length - 1) {
          logger.warn(`Compact reload attempt ${String(attempt + 1)} failed, retrying...`);
        } else {
          logger.warn(`Compact reload failed after ${String(delays.length)} attempts`);
        }
      }
    }
  }

  /** Read compacted JSONL from disk and replace in-memory messages. */
  private async reloadConversationFromDisk(sessionId: string): Promise<void> {
    try {
      const conv = await conversationLoad(sessionId);
      if (!conv) {
        logger.warn(`Compact reload: no conversation found for ${sessionId}`);
        return;
      }

      // Build ChatMessage[] from the disk data
      const chainableMessages = conv.messages.map((m) => ({
        id: m.id,
        parentUuid: m.parentUuid ?? undefined,
      }));
      const activeChainIds = new Set(getActiveChain(chainableMessages).map((m) => m.id));

      const newMessages: ChatMessage[] = conv.messages
        .filter((m) => activeChainIds.has(m.id))
        .map((m) => mapPersistedMessage({ ...m, role: m.role as 'user' | 'assistant' }));

      // Replace messages in store — full swap, no merge
      useChatStore.getState().setMessages(sessionId, newMessages);
      logger.info(
        `Compact reload: replaced ${String(newMessages.length)} messages for ${sessionId}`
      );
    } catch (err) {
      logger.warn(`Compact reload failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // Conversation Lifecycle Handlers
  // ══════════════════════════════════════════════════════════════════════

  private handleConversationCreated(
    message: Extract<ExtensionMessage, { type: 'conversation:created' }>
  ): void {
    const sid = message.session_id;

    // Switch file store to new session
    useFileStore.getState().switchSession(sid);

    // Create new session in store and set as active
    const chatStore = useChatStore.getState();
    chatStore.getOrCreateSession(sid);
    chatStore.setMessages(sid, []);
    chatStore.setActiveSession(sid);

    // Mark as loaded BEFORE React re-render — prevents the session loading effect
    // from sending a spurious conversation:load for this brand-new session.
    chatStore.markSessionLoaded(sid);

    // Invalidate any in-flight conversation:loaded responses from the PREVIOUS session.
    // On app start, Effect 3 sends conversation:load for the stale localStorage sessionId.
    // If the user sends a message before that response arrives, the stale conversation:loaded
    // calls setActiveSession(staleId) inside setTimeout(0) — hijacking activeSessionId back
    // to the old session and orphaning the user's message in the new session.
    // Bumping the epoch causes the setTimeout guard to reject the stale response.
    chatStore.bumpConversationLoadEpoch();

    // Set lastCreatedSessionId for hook subscription (replaces onSessionCreated callback)
    useChatStore.setState({ lastCreatedSessionId: sid });

    // Add to conversations array so handleSend's `conversationExists` check returns true.
    // Without this, the "New conversation" session isn't in conversations[] — handleSend
    // takes the pending message path, creates a SECOND session, and Effect 4 fires
    // prematurely with the first session's lastCreatedSessionId, orphaning the user message.
    const uiStore = useUIStore.getState();
    uiStore.addConversation({
      sessionId: sid,
      title: message.title,
      updatedAt: Date.now(),
      messageCount: 0,
      ...(message.workspace_path ? { workspacePath: message.workspace_path } : {}),
      ...(message.worktree_path ? { worktreePath: message.worktree_path } : {}),
    });
    uiStore.setActiveConversation(sid, message.title);
    useToolStore.getState().switchSession(sid);
  }

  private handleConversationList(
    message: Extract<ExtensionMessage, { type: 'conversation:list' }>
  ): void {
    useUIStore.getState().setConversations(
      message.conversations.map((c) => ({
        sessionId: c.session_id,
        title: c.title,
        updatedAt: c.updated_at,
        messageCount: c.message_count,
        ...(c.workspace_path ? { workspacePath: c.workspace_path } : {}),
        ...(c.worktree_path ? { worktreePath: c.worktree_path } : {}),
      }))
    );
  }

  private handleConversationLoading(): void {
    useUIStore.getState().setConversationTransitioning(true);
    // Messages are already stored in ChatStore keyed by session ID —
    // no manual caching needed (unlike the old React useState approach).
  }

  private handleConversationLoaded(
    message: Extract<ExtensionMessage, { type: 'conversation:loaded' }>
  ): void {
    const chatStore = useChatStore.getState();

    // Skip stale responses for remapped Orbit session IDs — but allow if the
    // user explicitly navigated to this session (e.g., clicking a parent session
    // in the sidebar after a rewind). The activeSessionId check ensures we only
    // block truly stale in-flight responses, not intentional sidebar clicks.
    if (
      message.session_id in chatStore.remappedOrbitIds &&
      chatStore.activeSessionId !== message.session_id
    ) {
      return;
    }

    // Snapshot cached messages BEFORE setTimeout(0) — store state may change during deferral
    const cachedMessages = chatStore.sessions[message.session_id]?.messages ?? null;

    // Capture epochs before deferral for staleness detection
    const epochAtLoad = chatStore.rewindEpoch;
    const newLoadEpoch = useChatStore.getState().bumpConversationLoadEpoch();

    setTimeout(() => {
      // Staleness guards — if a new conversation was created (handleConversationCreated
      // bumps conversationLoadEpoch) or a rewind happened, skip this stale response.
      const currentStore = useChatStore.getState();
      if (epochAtLoad !== currentStore.rewindEpoch) return;
      if (newLoadEpoch !== currentStore.conversationLoadEpoch) return;

      // Check if the user has navigated to a different session since this load
      // was initiated (e.g., user created a new session while the initial mount
      // load for the old session was in-flight). If so, populate the session's
      // messages (for when the user switches back) but do NOT hijack activeSessionId.
      const currentActive = useChatStore.getState().activeSessionId;
      const isStaleNavigation = currentActive !== null && currentActive !== message.session_id;

      // STREAMING GUARD: If the target session is actively streaming AND has live
      // messages in cache, the cache is authoritative. Disk data has different
      // message IDs (SDK UUIDs vs agent-bridge turn UUIDs), so merging would create
      // duplicate assistant messages and tool widgets. Skip message replacement
      // and tool restoration — just switch the active session pointer so the UI
      // shows the correct conversation.
      //
      // The hasLiveMessages check is critical: handleSend sets isAgentRunning=true
      // BEFORE conversation:loaded arrives with history. Without this check, we'd
      // skip the merge when the cache is empty, causing the user to never see
      // their own message or conversation history.
      const targetSession = useChatStore.getState().sessions[message.session_id];
      const hasLiveMessages = (targetSession?.messages.length ?? 0) > 0;
      if (targetSession?.isAgentRunning && hasLiveMessages) {
        logger.debug('Skipping conversation:loaded merge — session is actively streaming', {
          sessionId: message.session_id,
        });
        if (!isStaleNavigation) {
          const preferredTitle = getPreferredTitle(message.session_id);
          useFileStore.getState().switchSession(message.session_id);
          useChatStore.getState().setActiveSession(message.session_id);
          useUIStore
            .getState()
            .setActiveConversation(message.session_id, preferredTitle ?? message.title);
          useToolStore.getState().switchSession(message.session_id);
        }
        useUIStore.getState().setLoadingConversation(false);
        useUIStore.getState().setConversationTransitioning(false);
        return;
      }

      // Only switch file store if this load is for the active session
      if (!isStaleNavigation) {
        useFileStore.getState().switchSession(message.session_id);
      }

      startTransition(() => {
        // Prepare new messages (filter system messages, extract active chain)
        const allBackendMessages = message.messages
          .filter(
            (m): m is typeof m & { role: 'user' | 'assistant' } =>
              m.role === 'user' || m.role === 'assistant'
          )
          .map((m) => mapPersistedMessage(m));

        const backendMessages = getActiveChain(allBackendMessages);

        // Merge backend and cache messages
        let newMessages: ChatMessage[];
        if (!cachedMessages || cachedMessages.length === 0) {
          newMessages = backendMessages;
        } else if (backendMessages.length === 0) {
          newMessages = cachedMessages;
        } else {
          // Backend-backbone + live trailing merge
          const backendUserCount = backendMessages.filter((m) => m.role === 'user').length;
          const cachedUserCount = cachedMessages.filter((m) => m.role === 'user').length;

          if (cachedUserCount <= backendUserCount) {
            newMessages = backendMessages;

            // Edge case: trailing assistant message not yet persisted
            const backendLast = backendMessages[backendMessages.length - 1];
            if (backendLast?.role === 'user' && cachedMessages.length > backendMessages.length) {
              let usersSeen = 0;
              let lastUserIdx = -1;
              for (let i = 0; i < cachedMessages.length; i++) {
                if (cachedMessages[i]?.role === 'user') {
                  usersSeen++;
                  if (usersSeen === backendUserCount) {
                    lastUserIdx = i;
                    break;
                  }
                }
              }
              if (lastUserIdx >= 0 && lastUserIdx + 1 < cachedMessages.length) {
                const trailingMessages = cachedMessages.slice(lastUserIdx + 1);
                newMessages = [...backendMessages, ...trailingMessages];
              }
            }
          } else {
            // Cache has more user messages — find live trailing messages
            let usersSeen = 0;
            let liveStartIdx = -1;
            for (let i = 0; i < cachedMessages.length; i++) {
              if (cachedMessages[i]?.role === 'user') {
                usersSeen++;
                if (usersSeen > backendUserCount) {
                  liveStartIdx = i;
                  break;
                }
              }
            }
            const liveTrailingMessages =
              liveStartIdx >= 0 ? cachedMessages.slice(liveStartIdx) : [];
            newMessages = [...backendMessages, ...liveTrailingMessages];
          }
        }

        // Enrich with client-side-only fields from cache
        if (cachedMessages && cachedMessages.length > 0) {
          const cachedById = new Map(cachedMessages.map((m) => [m.id, m]));
          for (const msg of newMessages) {
            if (msg.interruptReason === undefined) {
              const cached = cachedById.get(msg.id);
              if (cached?.interruptReason !== undefined) {
                msg.interruptReason = cached.interruptReason;
              }
            }
          }
        }

        const activeChainIds = new Set(backendMessages.map((m) => m.id));

        // Restore session usage
        if (message.session_usage) {
          useToolStore.getState().restoreSessionUsage(message.session_id, {
            inputTokens: message.session_usage.inputTokens,
            outputTokens: message.session_usage.outputTokens,
            cacheReadInputTokens: message.session_usage.cacheReadInputTokens ?? 0,
            cacheCreationInputTokens: message.session_usage.cacheCreationInputTokens ?? 0,
            totalCostUsd: message.session_usage.totalCostUsd ?? 0,
          });
        } else if (message.messages.length > 0) {
          // Fallback: sum per-message usage from JSONL
          const seenIds = new Set<string>();
          const processedMessageIds: string[] = [];
          const cumulativeUsage = message.messages
            .filter((m) => activeChainIds.has(m.id))
            .reduce(
              (acc, m) => {
                if (m.usage && !seenIds.has(m.id)) {
                  seenIds.add(m.id);
                  processedMessageIds.push(m.id);
                  return {
                    inputTokens: acc.inputTokens + m.usage.inputTokens,
                    outputTokens: acc.outputTokens + m.usage.outputTokens,
                    cacheReadInputTokens:
                      acc.cacheReadInputTokens + (m.usage.cacheReadInputTokens ?? 0),
                    cacheCreationInputTokens:
                      acc.cacheCreationInputTokens + (m.usage.cacheCreationInputTokens ?? 0),
                    totalCostUsd: acc.totalCostUsd + (m.usage.totalCostUsd ?? 0),
                  };
                }
                return acc;
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
            useToolStore
              .getState()
              .restoreSessionUsage(message.session_id, cumulativeUsage, processedMessageIds);
          }
        }

        // Write messages to store
        useChatStore.getState().setMessages(message.session_id, newMessages);

        // Count messages with tools for diagnostic logging
        const messagesWithTools = message.messages.filter(
          (m) => activeChainIds.has(m.id) && m.toolUses.length > 0
        );
        const totalToolUses = messagesWithTools.reduce((acc, m) => acc + m.toolUses.length, 0);
        logger.debug(
          `conversation:loaded tool restoration: session=${message.session_id}, messages=${String(newMessages.length)}, msgsWithTools=${String(messagesWithTools.length)}, totalToolUses=${String(totalToolUses)}, isStale=${String(isStaleNavigation)}`
        );

        // Only switch active session if this load is for the currently active session
        // (data refresh or initial mount). Skip if the user navigated to a different
        // session — e.g., created a new session while this load was in-flight.
        // handleLoadConversation sets activeSession immediately on sidebar click,
        // so this guard won't break sidebar navigation.
        if (!isStaleNavigation) {
          const preferredTitle = getPreferredTitle(message.session_id);
          useChatStore.getState().setActiveSession(message.session_id);
          useUIStore
            .getState()
            .setActiveConversation(message.session_id, preferredTitle ?? message.title);
          useToolStore.getState().switchSession(message.session_id);
        }

        // Restore tool executions for active chain
        for (const m of message.messages) {
          if (activeChainIds.has(m.id) && m.toolUses.length > 0) {
            useToolStore.getState().restoreToolsForMessage(
              m.id,
              m.toolUses.map((t) => ({
                id: t.id,
                name: t.name,
                input: t.input,
                success: t.success,
                ...(t.output !== undefined ? { output: t.output } : {}),
                ...(t.contentOffset !== undefined ? { contentOffset: t.contentOffset } : {}),
                ...(t.ordinal !== undefined ? { ordinal: t.ordinal } : {}),
              })),
              message.session_id
            );
          }
        }

        // Log final tool state after restoration
        const finalToolState = useToolStore.getState();
        logger.debug(
          `conversation:loaded COMPLETE: completedTools=${String(finalToolState.completedTools.length)}, currentSession=${String(finalToolState.currentSessionId)}`
        );
      });
    }, 0);
  }

  private handleConversationRewound(
    message: Extract<ExtensionMessage, { type: 'conversation:rewound' }>
  ): void {
    const sid = message.session_id;

    // Cancel RAF batchers (discard stale pre-rewind chunks)
    this.cancelSession(sid);
    this.cleanupBatchers(sid);
    this.pendingChunkLengths.clear();

    // Bump rewind epoch so in-flight conversation:loaded is skipped
    useChatStore.getState().bumpRewindEpoch();

    // Prepare rewound messages
    const rewoundMessages: ChatMessage[] = message.messages.map((m) => mapPersistedMessage(m));

    const isSameSession = message.new_session_id === message.session_id;

    if (!isSameSession) {
      useToolStore.getState().switchSession(message.new_session_id);
      useFileStore.getState().switchSession(message.new_session_id);
      useChatStore.getState().setActiveSession(message.new_session_id);
      useUIStore.getState().setActiveConversation(message.new_session_id, 'Rewind');
    }

    const targetSessionId = isSameSession ? message.session_id : message.new_session_id;
    useChatStore.getState().setMessages(targetSessionId, rewoundMessages);

    // Set rewind fork point
    if (rewoundMessages.length > 0) {
      const lastRewoundMessage = rewoundMessages[rewoundMessages.length - 1];
      if (lastRewoundMessage) {
        useCheckpointStore.getState().setRewindForkPoint(targetSessionId, lastRewoundMessage.id);
      }
    }

    // Restore tool executions
    for (const m of message.messages) {
      if (m.toolUses && m.toolUses.length > 0) {
        useToolStore.getState().restoreToolsForMessage(
          m.id,
          m.toolUses.map((t) => ({
            id: t.id,
            name: t.name,
            input: t.input,
            success: t.success,
            ...(t.output !== undefined ? { output: t.output } : {}),
            ...(t.contentOffset !== undefined ? { contentOffset: t.contentOffset } : {}),
            ...(t.ordinal !== undefined ? { ordinal: t.ordinal } : {}),
          }))
        );
      }
    }
  }

  private handleConversationDeleted(
    message: Extract<ExtensionMessage, { type: 'conversation:deleted' }>
  ): void {
    useToolStore.getState().clearSessionTools(message.session_id);
    useFileStore.getState().clearSessionFiles(message.session_id);
    clearSessionTitleState(message.session_id);
    useChatStore.getState().destroySession(message.session_id);
    this.destroySession(message.session_id);
  }

  // ══════════════════════════════════════════════════════════════════════
  // Tool Handlers
  // ══════════════════════════════════════════════════════════════════════

  private handleToolStart(message: Extract<ExtensionMessage, { type: 'tool:start' }>): void {
    const sid = message.session_id;
    const toolId = message.tool_id;
    const toolName = message.tool_name;

    // Mark that this turn used tools — handleAgentComplete uses this to decide
    // whether to delay clearing isAgentRunning (intermediate turn) or clear immediately.
    this.turnHadTools.set(sid, true);
    this.cancelAgentRunningTimer(sid);

    // Record browser activity for AI Playwright tools
    if (toolName.toLowerCase().includes('browser')) {
      recordBrowserActivityFromAI();
    }

    // Look up current message state (needed for thinking finalization + message creation below)
    const store = useChatStore.getState();
    const session = store.sessions[sid];
    const messages = session?.messages ?? [];
    const lastMsg = messages.at(-1);
    const currentMsg =
      lastMsg?.id === message.message_id
        ? lastMsg
        : messages.find((m) => m.id === message.message_id);

    // Use the bridge's content_offset directly — it represents the total text
    // streamed before this tool, calculated after flushing buffered text.
    // Do NOT clamp with Math.min(offset, maxKnownLength): that permanently
    // corrupts the stored offset when the frontend hasn't received all flushed
    // text yet (small IPC delivery window). string.slice() with an offset beyond
    // content length safely returns the available text, and once the message
    // completes the offset falls within range.
    const contentOffset = Math.max(
      0,
      message.content_offset ??
        (currentMsg?.content.length ?? 0) + (this.pendingChunkLengths.get(message.message_id) ?? 0)
    );
    const toolOrdinal = this.nextMarkerOrdinal(message.message_id);

    // Call startTool synchronously for immediate widget rendering
    useToolStore
      .getState()
      .startTool(
        toolId,
        message.message_id,
        toolName,
        message.tool_input,
        contentOffset,
        sid,
        toolOrdinal
      );

    // Finalize current thinking block and mark thinking phase complete
    if (currentMsg?.isThinkingActive === true) {
      const thinkingContentOffset =
        currentMsg.content.length + (this.pendingChunkLengths.get(message.message_id) ?? 0);
      useChatStore.getState().updateMessage(sid, message.message_id, (msg) => {
        let updatedBlocks = msg.thinkingBlocks;
        if (updatedBlocks !== undefined && updatedBlocks.length > 0) {
          updatedBlocks = [...updatedBlocks];
          const lastBlock = updatedBlocks[updatedBlocks.length - 1];
          if (lastBlock !== undefined) {
            const startTime = this.thinkingStartTimes.get(message.message_id) ?? Date.now();
            updatedBlocks[updatedBlocks.length - 1] = {
              ...lastBlock,
              durationMs: Date.now() - startTime,
              contentOffset: thinkingContentOffset,
            };
          }
        }
        return {
          ...msg,
          isThinkingActive: false,
          ...(updatedBlocks !== undefined ? { thinkingBlocks: updatedBlocks } : {}),
        };
      });
    }

    // Create new assistant message if none exists for this message_id
    if (!currentMsg) {
      const parentUuid = messages.at(-1)?.id ?? null;
      useChatStore.getState().addMessage(sid, {
        id: message.message_id,
        role: 'assistant',
        content: '',
        displayedContent: '',
        isStreaming: true,
        parentUuid,
      });
    }

    // Re-assert isAgentRunning — tool:start is the first SYNCHRONOUS signal
    // that a new turn has started. agent:complete from the previous turn set
    // this to false, and the RAF-deferred batchers (thinking/chunk) can't fix
    // it fast enough. This must be synchronous to prevent even a single frame
    // where isAgentRunning is false while streaming is active.
    useChatStore.getState().setAgentRunning(sid, true);
  }

  private handleToolEnd(message: Extract<ExtensionMessage, { type: 'tool:end' }>): void {
    // Get tool data BEFORE completing (still in activeTools)
    const toolState = useToolStore.getState();
    const tool = toolState.activeTools[message.tool_id];

    // Track file changes for Edit/Write tools
    if (tool && message.success) {
      const toolName = tool.toolName.toLowerCase();
      const { addFileChange } = useFileStore.getState();

      if (toolName === 'edit') {
        const rawPath = tool.toolInput['file_path'];
        if (typeof rawPath !== 'string' || rawPath.length === 0) {
          logger.warn('Skipping Edit file change tracking: invalid file_path', {
            toolId: message.tool_id,
            rawPath,
          });
        } else {
          const rawOld = tool.toolInput['old_string'];
          const rawNew = tool.toolInput['new_string'];
          const oldString = typeof rawOld === 'string' ? rawOld : '';
          const newString = typeof rawNew === 'string' ? rawNew : '';
          addFileChange({
            path: rawPath,
            type: 'modified',
            oldContent: oldString,
            newContent: newString,
            diff: computeSimpleDiff(oldString, newString),
            language: getLanguageFromPath(rawPath),
          });
        }
      }
      if (toolName === 'write') {
        const rawPath = tool.toolInput['file_path'];
        if (typeof rawPath !== 'string' || rawPath.length === 0) {
          logger.warn('Skipping Write file change tracking: invalid file_path', {
            toolId: message.tool_id,
            rawPath,
          });
        } else {
          const rawContent = tool.toolInput['content'];
          const content = typeof rawContent === 'string' ? rawContent : '';
          addFileChange({
            path: rawPath,
            type: 'created',
            oldContent: '',
            newContent: content,
            diff: computeSimpleDiff('', content),
            language: getLanguageFromPath(rawPath),
          });
        }
      }
    }

    // Complete the tool
    useToolStore.getState().completeTool(message.tool_id, message.tool_output, message.success);
  }

  private handlePermissionRequest(
    message: Extract<ExtensionMessage, { type: 'permission:request' }>
  ): void {
    // Defensive: if permission arrives before tool:start, prevent stale timer clears.
    this.cancelAgentRunningTimer(message.session_id);
    // Flush pending text chunks so tool widget has a message row to render in
    this.chunkBatchers.get(message.session_id)?.cancel(FLUSH_PENDING);

    useToolStore.getState().addPermissionRequest({
      requestId: message.request_id,
      sessionId: message.session_id,
      toolName: message.tool_name,
      toolInput: message.tool_input,
      createdAt: Date.now(),
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // Mode / Model / File Handlers
  // ══════════════════════════════════════════════════════════════════════

  private handleInputModeChanged(
    message: Extract<ExtensionMessage, { type: 'inputMode:changed' }>
  ): void {
    useToolStore.getState().setInputMode(message.mode);
  }

  private handleModelChanged(message: Extract<ExtensionMessage, { type: 'model:changed' }>): void {
    useToolStore.getState().setModel(message.model);
  }

  private handleFileContent(message: Extract<ExtensionMessage, { type: 'file:content' }>): void {
    const language = getLanguageFromPath(message.path);
    useFileViewerStore.getState().setFileContent(message.path, message.content, language);
  }

  // ══════════════════════════════════════════════════════════════════════
  // Tool Cleanup
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Safety net: force-complete any tools still in `activeTools` for the given session.
   *
   * Normally the SDK guarantees tool:end before agent:complete within a single
   * session's `for await` loop. But in concurrent multi-session scenarios (stress
   * tests, interruptions, error races) a tool:end event can be lost in transit
   * across the async bridge → Rust → Tauri event → postMessage pipeline.
   *
   * Called from handleAgentComplete and handleAgentError so no tools stay orphaned.
   */
  private forceCompleteOrphanedTools(sessionId: string): void {
    const toolStore = useToolStore.getState();
    const orphanIds: string[] = [];

    for (const [id, tool] of Object.entries(toolStore.activeTools)) {
      if (tool.sessionId === sessionId) {
        orphanIds.push(id);
      }
    }

    if (orphanIds.length > 0) {
      logger.warn(
        `Force-completing ${String(orphanIds.length)} orphaned tool(s) for session ${sessionId}`
      );
      for (const id of orphanIds) {
        toolStore.completeTool(id, undefined, true);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // Batcher Management (Per-Session, Lazy Creation)
  // ══════════════════════════════════════════════════════════════════════

  private getOrCreateChunkBatcher(sessionId: string): RafBatchHandler<TextChunkEvent> {
    let batcher = this.chunkBatchers.get(sessionId);
    if (batcher) return batcher;

    const processEvents = (events: TextChunkEvent[]): void => {
      if (events.length === 0) return;

      // Bail if session was destroyed during deferral
      const session = useChatStore.getState().sessions[sessionId];
      if (!session) return;

      // Accumulate chunks by message ID
      const chunksByMessage = new Map<string, string>();
      for (const event of events) {
        const existing = chunksByMessage.get(event.messageId) ?? '';
        chunksByMessage.set(event.messageId, existing + event.content);
      }

      // Apply all accumulated content via store actions
      for (const [messageId, accumulatedContent] of chunksByMessage) {
        this.pendingChunkLengths.set(messageId, 0);

        const currentSession = useChatStore.getState().sessions[sessionId];
        if (!currentSession) continue;

        const msgs = currentSession.messages;
        const lastMsg = msgs.at(-1);

        if (lastMsg?.role === 'assistant' && lastMsg.id === messageId) {
          // Fast path: append to last assistant message
          // Finalize thinking block if active
          let updatedBlocks = lastMsg.thinkingBlocks;
          const thinkingContentOffset = lastMsg.content.length;
          if (
            lastMsg.isThinkingActive === true &&
            updatedBlocks !== undefined &&
            updatedBlocks.length > 0
          ) {
            updatedBlocks = [...updatedBlocks];
            const lastBlock = updatedBlocks[updatedBlocks.length - 1];
            if (lastBlock !== undefined) {
              const startTime = this.thinkingStartTimes.get(messageId) ?? Date.now();
              updatedBlocks[updatedBlocks.length - 1] = {
                ...lastBlock,
                durationMs: Date.now() - startTime,
                contentOffset: thinkingContentOffset,
              };
            }
          }

          useChatStore.getState().updateMessage(sessionId, messageId, (m) => {
            const newContent = m.content + accumulatedContent;
            return {
              ...m,
              content: newContent,
              // displayedContent NOT updated — reveal controller advances it word-by-word
              isThinkingActive: false,
              ...(updatedBlocks !== undefined ? { thinkingBlocks: updatedBlocks } : {}),
            };
          });
          this.revealController.startOrContinue(sessionId, messageId);
        } else {
          // Slow path or new message
          const existingMsg = msgs.find((m) => m.id === messageId && m.role === 'assistant');
          if (existingMsg) {
            useChatStore.getState().updateMessage(sessionId, messageId, (m) => {
              const newContent = m.content + accumulatedContent;
              return { ...m, content: newContent };
            });
            this.revealController.startOrContinue(sessionId, messageId);
          } else {
            // First chunk of new response (possibly a new turn in multi-tool flow)
            const parentUuid = msgs.at(-1)?.id ?? null;
            useChatStore.getState().addMessage(sessionId, {
              id: messageId,
              role: 'assistant',
              content: accumulatedContent,
              displayedContent: '',
              isStreaming: true,
              parentUuid,
            });
            // Re-assert isAgentRunning — agent:complete from the previous turn
            // may have set it to false before this chunk arrived. Without this,
            // the loading indicator disappears between multi-turn tool calls.
            useChatStore.getState().setAgentRunning(sessionId, true);
            this.revealController.startOrContinue(sessionId, messageId);
          }
        }
      }
    };

    batcher = rafBatch<TextChunkEvent>(processEvents);

    this.chunkBatchers.set(sessionId, batcher);
    return batcher;
  }

  private getOrCreateThinkingBatcher(sessionId: string): RafBatchHandler<ThinkingChunkEvent> {
    let batcher = this.thinkingBatchers.get(sessionId);
    if (batcher) return batcher;

    batcher = rafBatch<ThinkingChunkEvent>((events) => {
      if (events.length === 0) return;

      const session = useChatStore.getState().sessions[sessionId];
      if (!session) return;

      const thinkingByMessage = new Map<string, string>();
      for (const event of events) {
        const existing = thinkingByMessage.get(event.messageId) ?? '';
        thinkingByMessage.set(event.messageId, existing + event.thinking);
      }

      for (const [messageId, accumulatedThinking] of thinkingByMessage) {
        const currentSession = useChatStore.getState().sessions[sessionId];
        if (!currentSession) continue;

        const msgs = currentSession.messages;
        const lastMsg = msgs.at(-1);

        if (lastMsg?.role === 'assistant' && lastMsg.id === messageId) {
          useChatStore.getState().updateMessage(sessionId, messageId, (m) => {
            const needsNewBlock = m.isThinkingActive !== true;
            const blocks = [...(m.thinkingBlocks ?? [])];

            if (blocks.length === 0 || needsNewBlock) {
              if (blocks.length > 0) {
                this.thinkingStartTimes.set(messageId, Date.now());
              }
              blocks.push({
                content: accumulatedThinking,
                durationMs: 0,
                ordinal: this.nextMarkerOrdinal(messageId),
              });
            } else {
              const lastBlock = blocks[blocks.length - 1];
              if (lastBlock !== undefined) {
                const startTime = this.thinkingStartTimes.get(messageId) ?? Date.now();
                blocks[blocks.length - 1] = {
                  content: lastBlock.content + accumulatedThinking,
                  durationMs: Date.now() - startTime,
                };
              }
            }

            const existingThinking = m.thinking ?? '';
            const newThinking =
              needsNewBlock && existingThinking.length > 0
                ? `${existingThinking}\n\n${accumulatedThinking}`
                : existingThinking + accumulatedThinking;
            return {
              ...m,
              thinking: newThinking,
              thinkingBlocks: blocks,
              isThinkingActive: true,
            };
          });
        } else {
          // No assistant message yet — create one with just thinking
          const parentUuid = msgs.at(-1)?.id ?? null;
          this.thinkingStartTimes.set(messageId, Date.now());
          useChatStore.getState().addMessage(sessionId, {
            id: messageId,
            role: 'assistant',
            content: '',
            displayedContent: '',
            isStreaming: true,
            thinking: accumulatedThinking,
            thinkingBlocks: [
              {
                content: accumulatedThinking,
                durationMs: 0,
                ordinal: this.nextMarkerOrdinal(messageId),
              },
            ],
            isThinkingActive: true,
            parentUuid,
          });
          // Re-assert isAgentRunning — agent:complete from the previous turn
          // may have set it to false before this thinking chunk arrived.
          useChatStore.getState().setAgentRunning(sessionId, true);
        }
      }
    });

    this.thinkingBatchers.set(sessionId, batcher);
    return batcher;
  }

  private cleanupBatchers(sessionId: string): void {
    this.chunkBatchers.delete(sessionId);
    this.thinkingBatchers.delete(sessionId);
    this.toolBatchers.delete(sessionId);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Singleton Export
// ────────────────────────────────────────────────────────────────────────────

export const chatMessageService = new ChatMessageService();

// HMR cleanup — cancel all batchers when module is replaced
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    chatMessageService.destroyAll();
  });
}
