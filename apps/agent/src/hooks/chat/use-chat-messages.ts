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
 * [warning] TESTED: The pending-message title generation effect is covered by
 * integration tests. If you modify this, run: bun run test -- use-chat-messages-title
 * Test file: src/__tests__/integration/hooks/chat/use-chat-messages-title.test.tsx
 *
 * Previously 577 lines with useState, useSessionState, useMessageState,
 * createMessageHandler (1629-line closure), and buffer hydration.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { createChatActions } from './handlers/chat-actions';

import type { ChatMessage, ImageAttachment } from '@/components/chat';
import type { DemoConfig, DemoRunnerControls, DemoScript } from '@/demo/types';
import type { ReviewFixesStressTestConfig } from '@/stress-tests/review-fixes-stress-test';
import type { MegaStressTestConfig } from '@/stress-tests/rewind-mega-stress-test';
import type { StressTestConfig } from '@/stress-tests/rewind-stress-test';
import type { SessionStressTestConfig } from '@/stress-tests/session-stress-test';
import type { ToolGauntletStressTestConfig } from '@/stress-tests/tool-gauntlet-stress-test';
import type { UpdateSimulationConfig } from '@/stress-tests/update-simulation';
import type { VerifiedReviewCycle1StressTestConfig } from '@/stress-tests/verified-review-cycle1-stress-test';
import type {
  EffortLevel,
  Model,
  ReactElementContext,
  ThinkingMode,
  WebviewMessage,
} from '@/types/protocol';

import { useTauri } from '@/hooks/agent/use-tauri';
import { conversationAddMessage, conversationLoad } from '@/lib/api';
import {
  buildOptimisticAttachedImages,
  cacheAttachedImagesForMessage,
} from '@/services/chat/image-attachment-cache';
import { applySessionTitle, generateAITitle, generateFallbackTitle } from '@/services/session';
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
          runRewindStressTest?: (config?: StressTestConfig) => Promise<unknown>;
          runMegaStressTest?: (config?: MegaStressTestConfig) => Promise<unknown>;
          runSessionStressTest?: (config?: SessionStressTestConfig) => Promise<unknown>;
          runReviewFixesStressTest?: (config?: ReviewFixesStressTestConfig) => Promise<unknown>;
          runToolGauntletStressTest?: (config?: ToolGauntletStressTestConfig) => Promise<unknown>;
          runVerifiedReviewCycle1StressTest?: (
            config?: VerifiedReviewCycle1StressTestConfig
          ) => Promise<unknown>;
          runDemo?: (script: DemoScript, config?: DemoConfig) => Promise<DemoRunnerControls>;
          runLaunchDemo?: (config?: DemoConfig) => Promise<DemoRunnerControls>;
          simulateUpdate?: (config?: UpdateSimulationConfig) => Promise<void>;
          simulateUpdateQuickCycle?: () => Promise<void>;
          handleSend?: (text: string) => void;
          handleRewind?: (messageId: string) => void;
          handleStop?: () => void;
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
    elements?: ReactElementContext[],
    skills?: string[]
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
    const sendableImages = (images ?? []).flatMap((image) =>
      image.data
        ? [
            {
              name: image.name,
              mimeType: image.mimeType,
              data: image.data,
            },
          ]
        : []
    );

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
    if (isAdaptiveThinkingModel(toolState.model)) {
      postMessage({
        type: 'effort:set',
        uuid: crypto.randomUUID(),
        session_id: lastCreatedSessionId,
        effort: toolState.effortLevel,
      });
    }

    // Update title immediately, then kick off async title generation.
    applySessionTitle(lastCreatedSessionId, generateFallbackTitle(text || 'Image conversation'));
    generateAITitle(lastCreatedSessionId, text || 'Image conversation');

    // Build user message
    const chatStore = useChatStore.getState();
    const session = chatStore.sessions[lastCreatedSessionId];
    const msgs = session?.messages ?? [];
    const lastMsg = msgs[msgs.length - 1];
    const parentUuid = lastMsg?.id ?? null;

    const optimisticImages = buildOptimisticAttachedImages(images);
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      displayedContent: text,
      attachedFiles: contextFiles,
      attachedImages: optimisticImages,
      parentUuid,
    };

    chatStore.addMessage(lastCreatedSessionId, userMessage);
    cacheAttachedImagesForMessage(lastCreatedSessionId, userMessage.id, images);
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
    const hasImages = sendableImages.length > 0;
    const hasElements = elements && elements.length > 0;
    const context =
      hasFiles || hasImages || hasElements
        ? {
            files: hasFiles ? contextFiles : undefined,
            images: hasImages ? sendableImages : undefined,
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

    const debugEntries = {
      handleSend: actions.handleSend,
      handleRewind: actions.handleRewind,
      handleStop: actions.handleStop,
      runDemo: async (script: DemoScript, config?: DemoConfig) => {
        const { runDemoScript } = await import('@/demo');
        return runDemoScript(
          script,
          {
            handleSend: actions.handleSend,
            handleStop: actions.handleStop,
            handleOpenFile: actions.handleOpenFile,
            postMessage,
          },
          config
        );
      },
      runLaunchDemo: async (config?: DemoConfig) => {
        const { launchVideoScript } = await import('@/demo/scripts/launch-video');
        const { runDemoScript } = await import('@/demo');
        return runDemoScript(
          launchVideoScript,
          {
            handleSend: actions.handleSend,
            handleStop: actions.handleStop,
            handleOpenFile: actions.handleOpenFile,
            postMessage,
          },
          config
        );
      },
      runRewindStressTest: async (config?: StressTestConfig) => {
        const { runRewindStressTest } = await import('@/stress-tests/rewind-stress-test');
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
        const { runMegaStressTest } = await import('@/stress-tests/rewind-mega-stress-test');
        return runMegaStressTest(
          {
            handleSend: actions.handleSend,
            handleRewind: actions.handleRewind,
            handleStop: actions.handleStop,
          },
          config
        );
      },
      runSessionStressTest: async (config?: SessionStressTestConfig) => {
        const { runSessionStressTest } = await import('@/stress-tests/session-stress-test');
        return runSessionStressTest(
          {
            handleSend: actions.handleSend,
            handleStop: actions.handleStop,
            postMessage,
          },
          config
        );
      },
      runReviewFixesStressTest: async (config?: ReviewFixesStressTestConfig) => {
        const { runReviewFixesStressTest } =
          await import('@/stress-tests/review-fixes-stress-test');
        return runReviewFixesStressTest(
          {
            handleSend: actions.handleSend,
            handleStop: actions.handleStop,
            handleEffortLevelChange: actions.handleEffortLevelChange,
            handleModelChange: actions.handleModelChange,
            handleThinkingModeChange: actions.handleThinkingModeChange,
            postMessage,
          },
          config
        );
      },
      runToolGauntletStressTest: async (config?: ToolGauntletStressTestConfig) => {
        const { runToolGauntletStressTest } =
          await import('@/stress-tests/tool-gauntlet-stress-test');
        return runToolGauntletStressTest(
          {
            handleSend: actions.handleSend,
            handleStop: actions.handleStop,
            postMessage,
          },
          config
        );
      },
      runVerifiedReviewCycle1StressTest: async (config?: VerifiedReviewCycle1StressTestConfig) => {
        const { runVerifiedReviewCycle1StressTest } =
          await import('@/stress-tests/verified-review-cycle1-stress-test');
        return runVerifiedReviewCycle1StressTest(
          {
            handleSend: actions.handleSend,
            handleStop: actions.handleStop,
          },
          config
        );
      },
      simulateUpdate: async (config?: UpdateSimulationConfig) => {
        const { simulateUpdate } = await import('@/stress-tests/update-simulation');
        return simulateUpdate(config);
      },
      simulateUpdateQuickCycle: async () => {
        const { simulateUpdateQuickCycle } = await import('@/stress-tests/update-simulation');
        return simulateUpdateQuickCycle();
      },
    } satisfies NonNullable<Window['__orbit_debug']>;

    const existingDebug = window.__orbit_debug ?? {};
    window.__orbit_debug = {
      ...existingDebug,
      ...debugEntries,
    };

    return (): void => {
      const debug = window.__orbit_debug;
      if (!debug) return;

      for (const [key, value] of Object.entries(debugEntries)) {
        const typedKey = key as keyof NonNullable<Window['__orbit_debug']>;
        if (debug[typedKey] === value) {
          Reflect.deleteProperty(debug, typedKey);
        }
      }

      if (Object.keys(debug).length === 0) {
        window.__orbit_debug = undefined;
      }
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
