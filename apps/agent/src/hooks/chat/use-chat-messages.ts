/**
 * useChatMessages — Thin reader hook for chat session state.
 *
 * All chat state lives in ChatStore (Zustand singleton). Backend events are
 * handled by ChatMessageService (module-level singleton). This hook:
 *
 * 1. Reads reactive state via ChatStore selectors
 * 2. Provides compatibility wrappers (setMessages, setIsAgentRunning) for
 *    downstream consumers that still expect React.Dispatch-style setters
 * 3. Runs effects: usage restore, conversation list, session loading,
 *    pending message send, cross-instance sync, ToolStore session sync
 * 4. Creates chat actions (handleSend, handleStop, etc.)
 *
 * Previously 577 lines with useState, useSessionState, useMessageState,
 * createMessageHandler (1629-line closure), and buffer hydration.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { createChatActions } from './handlers/chat-actions';

import type { ChatMessage, ImageAttachment } from '@/components/chat';
import type { MegaStressTestConfig } from '@/services/chat/rewind-mega-stress-test';
import type { StressTestConfig } from '@/services/chat/rewind-stress-test';
import type {
  EffortLevel,
  Model,
  ReactElementContext,
  ThinkingMode,
  WebviewMessage,
} from '@/types/protocol';

import { useTauri } from '@/hooks/agent/use-tauri';
import { conversationAddMessage, conversationLoad } from '@/lib/api';
import { useMessageBufferStore } from '@/stores/agent/message-buffer-store';
import { isAdaptiveThinkingModel, useToolStore } from '@/stores/agent/tool-store';
import {
  useActiveMessages,
  useActiveSessionId,
  useChatStore,
  useIsAgentRunning,
} from '@/stores/chat/chat-store';
import { useUIStore } from '@/stores/ui/ui-store';

// ────────────────────────────────────────────────────────────────────────────
// Dev-mode debug interface (window.__orbit_debug)
// ────────────────────────────────────────────────────────────────────────────

declare global {
  interface Window {
    __orbit_debug?:
      | {
          runRewindStressTest: (config?: StressTestConfig) => Promise<unknown>;
          runMegaStressTest: (config?: MegaStressTestConfig) => Promise<unknown>;
          handleSend: (text: string) => void;
          handleRewind: (messageId: string) => void;
          handleStop: () => void;
        }
      | undefined;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Return Type
// ────────────────────────────────────────────────────────────────────────────

interface UseChatMessagesReturn {
  messages: ChatMessage[];
  isAgentRunning: boolean;
  sessionId: string;
  isMockMode: boolean;
  postMessage: (message: WebviewMessage) => void;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setIsAgentRunning: React.Dispatch<React.SetStateAction<boolean>>;
  handleSend: (
    text: string,
    contextFiles?: string[],
    images?: ImageAttachment[],
    elements?: ReactElementContext[]
  ) => void;
  handleStop: () => void;
  handleRewind: (messageId: string) => void;
  handlePermissionApprove: (
    requestId: string,
    always?: boolean,
    answers?: Record<string, string>
  ) => void;
  handlePermissionDeny: (requestId: string) => void;
  handleOpenFile: (path: string) => void;
  handleOpenUrl: (url: string) => void;
  handleModeChange: (mode: 'default' | 'plan' | 'accept') => void;
  handleThinkingModeChange: (mode: ThinkingMode) => void;
  handleEffortLevelChange: (level: EffortLevel) => void;
  handleModelChange: (model: Model) => void;
}

// ────────────────────────────────────────────────────────────────────────────
// Hook
// ────────────────────────────────────────────────────────────────────────────

export function useChatMessages(): UseChatMessagesReturn {
  // ── Reactive state from ChatStore ──────────────────────────────────────
  const messages = useActiveMessages();
  const isAgentRunning = useIsAgentRunning();
  const sessionId = useActiveSessionId() ?? '';

  // ── Communication ─────────────────────────────────────────────────────
  // No onMessage handler — ChatMessageService receives events via the
  // singleton window listener in use-tauri-message-listener.ts
  const { postMessage, isMockMode } = useTauri();

  // UIStore selectors (only these cause re-renders)
  const workspacePath = useUIStore((s) => s.workspacePath);
  const activeWorktreePath = useUIStore((s) => s.activeWorktreePath);

  // ── Compat wrappers ───────────────────────────────────────────────────
  // ChatArea passes these to useQueuedMessageHandler which calls
  // setMessages(prev => [...prev, msg]). Wrappers delegate to ChatStore.
  const setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>> = useCallback(
    (updater) => {
      const store = useChatStore.getState();
      const sid = store.activeSessionId;
      if (!sid) return;
      const current = store.sessions[sid]?.messages ?? [];
      const next = typeof updater === 'function' ? updater(current) : updater;
      store.setMessages(sid, next);
    },
    []
  );

  const setIsAgentRunning: React.Dispatch<React.SetStateAction<boolean>> = useCallback(
    (updater) => {
      const store = useChatStore.getState();
      const sid = store.activeSessionId;
      if (!sid) return;
      const current = store.sessions[sid]?.isAgentRunning ?? false;
      const next = typeof updater === 'function' ? updater(current) : updater;
      store.setAgentRunning(sid, next);
    },
    []
  );

  // ══════════════════════════════════════════════════════════════════════
  // Effects
  // ══════════════════════════════════════════════════════════════════════

  // ── 1. Restore usage from backend on initial mount ────────────────────
  // When sessionId is restored from localStorage, load persisted usage
  // data so token counts survive window reloads.
  const hasRestoredUsage = useRef(false);
  const initialSessionId = useRef(sessionId);
  useEffect(() => {
    const sid = initialSessionId.current;
    if (!sid || hasRestoredUsage.current) return;
    hasRestoredUsage.current = true;

    void (async (): Promise<void> => {
      try {
        const conversation = await conversationLoad(sid);
        if (!conversation?.messages) return;

        const processedMessageIds: string[] = [];
        const cumulativeUsage = conversation.messages.reduce(
          (acc, m) => {
            if (m.usage) {
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

        const toolState = useToolStore.getState();
        if (processedMessageIds.length > 0) {
          toolState.restoreSessionUsage(sid, cumulativeUsage, processedMessageIds);
          if (toolState.currentSessionId === sid) {
            useToolStore.getState().switchSession(sid);
          }
        }

        for (const m of conversation.messages) {
          if (m.toolUses !== undefined && m.toolUses.length > 0) {
            useToolStore.getState().restoreToolsForMessage(m.id, m.toolUses);
          }
        }
      } catch {
        // Ignore — conversation may not exist yet
      }
    })();
  }, []); // Mount-only — uses refs for values

  // ── 2. Request conversation list on workspace change ──────────────────
  useEffect(() => {
    if (sessionId || workspacePath) {
      postMessage({
        type: 'conversation:list',
        uuid: crypto.randomUUID(),
        workspace_path: workspacePath ?? undefined,
        worktree_path: activeWorktreePath ?? undefined,
      });
    }
  }, [sessionId, workspacePath, activeWorktreePath, postMessage]);

  // ── 3. Load messages from backend on session change ───────────────────
  // Handles initial mount (sessionId from localStorage) and sidebar switching.
  // ChatStore.loadedSessions tracks which sessions have been loaded to prevent
  // duplicate conversation:load requests.
  useEffect(() => {
    if (!sessionId) return;

    const chatStore = useChatStore.getState();
    if (chatStore.isSessionLoaded(sessionId)) return;

    // Check if another component (e.g., sidebar) already has a pending load
    const bufferStore = useMessageBufferStore.getState();
    if (bufferStore.hasLoadPending(sessionId)) {
      chatStore.markSessionLoaded(sessionId);
      bufferStore.clearLoadPending(sessionId);
      return;
    }

    chatStore.markSessionLoaded(sessionId);
    bufferStore.markLoadPending(sessionId);

    postMessage({
      type: 'conversation:load',
      uuid: crypto.randomUUID(),
      session_id: sessionId,
    });
  }, [sessionId, postMessage]);

  // ── 4. Send pending message after conversation creation ───────────────
  // When handleSend detects no session exists, it stores the message in
  // ChatStore.pendingMessage and sends conversation:create. The service
  // sets lastCreatedSessionId on conversation:created. This effect then
  // sends the actual message.
  const pendingMessage = useChatStore((s) => s.pendingMessage);
  const lastCreatedSessionId = useChatStore((s) => s.lastCreatedSessionId);

  useEffect(() => {
    if (!lastCreatedSessionId || !pendingMessage) return;

    // Guard: don't send if user already switched to a different session
    if (lastCreatedSessionId !== (useChatStore.getState().activeSessionId ?? '')) return;

    const { text, contextFiles, images, elements } = pendingMessage;
    useChatStore.getState().setPendingMessage(null);

    // Send thinking mode, model, and effort BEFORE the message
    const toolState = useToolStore.getState();
    if (!isAdaptiveThinkingModel(toolState.model)) {
      postMessage({
        type: 'thinking:set',
        uuid: crypto.randomUUID(),
        session_id: lastCreatedSessionId,
        mode: toolState.thinkingMode,
      });
    }
    postMessage({
      type: 'model:set',
      uuid: crypto.randomUUID(),
      session_id: lastCreatedSessionId,
      model: toolState.model,
    });
    postMessage({
      type: 'effort:set',
      uuid: crypto.randomUUID(),
      session_id: lastCreatedSessionId,
      effort: toolState.effortLevel,
    });

    // Update title
    useUIStore.getState().updateConversationTitle(lastCreatedSessionId, text);
    postMessage({
      type: 'conversation:updateTitle',
      uuid: crypto.randomUUID(),
      session_id: lastCreatedSessionId,
      title: text,
    });

    // Build user message
    const chatStore = useChatStore.getState();
    const session = chatStore.sessions[lastCreatedSessionId];
    const msgs = session?.messages ?? [];
    const lastMsg = msgs[msgs.length - 1];
    const parentUuid = lastMsg?.id ?? null;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      displayedContent: text,
      attachedFiles: contextFiles,
      attachedImages: images,
      parentUuid,
    };

    chatStore.addMessage(lastCreatedSessionId, userMessage);
    chatStore.setAgentRunning(lastCreatedSessionId, true);

    // Broadcast for cross-instance sync (Agent ↔ Editor)
    window.dispatchEvent(
      new CustomEvent('orbit:user-message', {
        detail: { sessionId: lastCreatedSessionId, message: userMessage },
      })
    );

    // Persist user message to backend
    void conversationAddMessage(
      lastCreatedSessionId,
      {
        id: userMessage.id,
        role: 'user',
        content: text,
        createdAt: Date.now(),
        parentUuid,
      },
      workspacePath ?? undefined,
      activeWorktreePath ?? undefined
    );

    // Build context
    const hasFiles = contextFiles && contextFiles.length > 0;
    const hasImages = images && images.length > 0;
    const hasElements = elements && elements.length > 0;
    const context =
      hasFiles || hasImages || hasElements
        ? {
            files: hasFiles ? contextFiles : undefined,
            images: hasImages
              ? images.map((img) => ({
                  name: img.name,
                  mimeType: img.mimeType,
                  data: img.data,
                }))
              : undefined,
            elements: hasElements ? elements : undefined,
          }
        : undefined;

    postMessage({
      type: 'message:send',
      uuid: userMessage.id,
      session_id: lastCreatedSessionId,
      content: text,
      parent_uuid: parentUuid,
      context,
    });
  }, [lastCreatedSessionId, pendingMessage, postMessage, workspacePath, activeWorktreePath]);

  // ── 5. Cross-instance user message sync (Agent ↔ Editor) ──────────────
  // Both views share the same ChatStore, but the CustomEvent approach ensures
  // messages are visible even if React trees use separate mount points.
  useEffect(() => {
    const handler = (e: Event): void => {
      const detail = (e as CustomEvent<{ sessionId: string; message: ChatMessage }>).detail;
      if (detail.sessionId !== sessionId) return;
      // Dedupe: the sending instance already wrote to ChatStore
      const store = useChatStore.getState();
      const session = store.sessions[sessionId];
      if (session?.messages.some((m) => m.id === detail.message.id) === true) return;
      store.addMessage(sessionId, detail.message);
    };
    window.addEventListener('orbit:user-message', handler);
    return (): void => {
      window.removeEventListener('orbit:user-message', handler);
    };
  }, [sessionId]);

  // ── 6. Sync ToolStore session on activeSessionId change ───────────────
  // Ensures token usage tracking follows the active session.
  useEffect(() => {
    if (sessionId) {
      const toolState = useToolStore.getState();
      if (toolState.currentSessionId !== sessionId) {
        toolState.switchSession(sessionId);
      }
    }
  }, [sessionId]);

  // ── 7. Dev-mode debug interface ─────────────────────────────────────
  // Exposes chatActions on window.__orbit_debug for DevTools console access.
  // Used by the rewind stress test and manual debugging.
  useEffect(() => {
    if (!import.meta.env.DEV) return;

    const actions = createChatActions({ postMessage });
    window.__orbit_debug = {
      handleSend: actions.handleSend,
      handleRewind: actions.handleRewind,
      handleStop: actions.handleStop,
      runRewindStressTest: async (config?: StressTestConfig) => {
        const { runRewindStressTest } = await import('@/services/chat/rewind-stress-test');
        return runRewindStressTest(
          {
            handleSend: actions.handleSend,
            handleRewind: actions.handleRewind,
            handleStop: actions.handleStop,
          },
          config
        );
      },
      runMegaStressTest: async (config?: MegaStressTestConfig) => {
        const { runMegaStressTest } = await import('@/services/chat/rewind-mega-stress-test');
        return runMegaStressTest(
          {
            handleSend: actions.handleSend,
            handleRewind: actions.handleRewind,
            handleStop: actions.handleStop,
          },
          config
        );
      },
    };

    return (): void => {
      window.__orbit_debug = undefined;
    };
  }, [postMessage]);

  // ══════════════════════════════════════════════════════════════════════
  // Actions
  // ══════════════════════════════════════════════════════════════════════

  const chatActions = useMemo(() => createChatActions({ postMessage }), [postMessage]);

  return {
    messages,
    isAgentRunning,
    sessionId,
    isMockMode,
    postMessage,
    setMessages,
    setIsAgentRunning,
    ...chatActions,
  };
}
