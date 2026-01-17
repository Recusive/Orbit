/**
 * useAgentConversation - Manages per-node conversation sessions for mission agents
 *
 * This hook ensures each AgentCard in the Canvas has its own persistent conversation:
 * - First expand → Creates new conversation (appears in Agent sidebar)
 * - Re-expand same node → Loads existing conversation
 *
 * The hook integrates with the existing Agent app conversation system via:
 * - `conversation:create` / `conversation:load` messages
 * - UIStore's addConversation for sidebar listing
 * - Session management for ChatArea to display the correct conversation
 *
 * IMPORTANT: When on the Canvas tab, the Agent app's useChatMessages hook isn't running,
 * so we must handle conversation:created/loaded fully here, including updating global state.
 */

import { createLogger } from '@orbit/common/lib';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useMissionsStore } from '../stores/missionsStore';

import type { AgentCard } from '../types';
import type { ExtensionMessage } from '@/types/protocol';

import { useTauri } from '@/hooks/agent/use-tauri';
import { useToolStore } from '@/stores/agent/tool-store';
import { useUIStore } from '@/stores/ui/ui-store';

const logger = createLogger('AgentConversation');

interface UseAgentConversationOptions {
  /** The agent card to manage conversation for */
  agent: AgentCard;
  /** Called when conversation is ready (created or loaded) */
  onReady?: (sessionId: string) => void;
}

interface UseAgentConversationReturn {
  /** Whether the conversation is being initialized */
  isInitializing: boolean;
  /** The session ID for this agent's conversation - tracks locally so it updates immediately */
  sessionId: string | undefined;
}

export function useAgentConversation({
  agent,
  onReady,
}: UseAgentConversationOptions): UseAgentConversationReturn {
  const updateAgent = useMissionsStore((state) => state.updateAgent);
  const workspacePath = useUIStore((state) => state.workspacePath);

  // Track initialization state - start as TRUE to show loading initially
  // This prevents ChatArea from rendering with the old/wrong session
  const [isInitializing, setIsInitializing] = useState(true);

  // Track sessionId locally - this updates immediately when conversation is created,
  // unlike agent.sessionId which only updates after parent component re-renders
  const [localSessionId, setLocalSessionId] = useState<string | undefined>(agent.sessionId);

  const hasInitializedRef = useRef(false);
  // Store the pending creation UUID to match responses
  const pendingCreateUuidRef = useRef<string | null>(null);

  // Handle incoming messages - specifically looking for conversation:created
  // IMPORTANT: When on Canvas tab, useChatMessages isn't running, so we must
  // handle the full conversation lifecycle here (not just saving sessionId)
  const handleMessage = useCallback(
    (message: ExtensionMessage): void => {
      // Handle conversation:created response
      if (message.type === 'conversation:created') {
        // Check if this is the response to OUR creation request
        // Match by UUID (not title) to avoid mis-assigning sessions when:
        // - Two agents have the same name (title collision)
        // - Agent name changes while request is in-flight
        if (
          pendingCreateUuidRef.current !== null &&
          message.uuid === pendingCreateUuidRef.current
        ) {
          logger.info('Conversation created for agent', {
            agentId: agent.id,
            agentName: agent.name,
            sessionId: message.session_id,
          });

          // Save the sessionId to the agent card (persists in missions store)
          updateAgent(agent.id, { sessionId: message.session_id });

          // Update local state immediately - this is what ChatArea will use as key
          setLocalSessionId(message.session_id);

          // Update global UI state - this is what useChatMessages normally does
          // Without this, ChatArea would show the wrong conversation
          const uiStore = useUIStore.getState();
          uiStore.setActiveConversation(message.session_id, message.title);
          uiStore.addConversation({
            sessionId: message.session_id,
            title: message.title,
            updatedAt: Date.now(),
            messageCount: 0,
            ...(message.workspace_path ? { workspacePath: message.workspace_path } : {}),
          });

          // Switch tool store session (for usage tracking)
          const toolStore = useToolStore.getState();
          toolStore.switchSession(message.session_id);

          // CRITICAL: Update localStorage BEFORE setIsInitializing(false)
          // When Canvas is open, the Agent's ChatArea is detached (chatAreaDetached=true),
          // so the Agent's message-handler.ts is NOT running. We are the ONLY handler
          // processing conversation:created. ChatArea's useSessionState reads from
          // localStorage on mount, so we must update it BEFORE allowing ChatArea to mount.
          try {
            localStorage.setItem('orbit-sessionId', message.session_id);
          } catch {
            // Ignore storage errors - ChatArea will still work via key={sessionId} remount
          }

          // Clear pending state
          pendingCreateUuidRef.current = null;

          // NOW allow ChatArea to mount (it will read the correct sessionId from localStorage)
          setIsInitializing(false);

          // Notify caller
          onReady?.(message.session_id);
        }
      }

      // Handle conversation:loaded response
      if (message.type === 'conversation:loaded') {
        // Check if this is for our agent's session
        if (agent.sessionId && message.session_id === agent.sessionId) {
          logger.info('Conversation loaded for agent', {
            agentId: agent.id,
            agentName: agent.name,
            sessionId: message.session_id,
          });

          // Update global UI state - same as useChatMessages does
          const uiStore = useUIStore.getState();
          uiStore.setActiveConversation(message.session_id, message.title);
          uiStore.setConversationTransitioning(false);
          uiStore.setLoadingConversation(false);

          // Switch tool store session
          const toolStore = useToolStore.getState();
          toolStore.switchSession(message.session_id);

          // CRITICAL: Update localStorage BEFORE setIsInitializing(false)
          // Same reasoning as conversation:created - ChatArea reads localStorage on mount
          try {
            localStorage.setItem('orbit-sessionId', message.session_id);
          } catch {
            // Ignore storage errors
          }

          setIsInitializing(false);
          onReady?.(message.session_id);
        }
      }
    },
    [agent.id, agent.name, agent.sessionId, updateAgent, onReady]
  );

  const { postMessage } = useTauri({ onMessage: handleMessage });

  // Initialize conversation on mount
  useEffect(() => {
    // Only initialize once per mount
    if (hasInitializedRef.current) {
      return;
    }
    hasInitializedRef.current = true;

    if (agent.sessionId) {
      // Agent already has a conversation - load it
      logger.info('Loading existing conversation for agent', {
        agentId: agent.id,
        agentName: agent.name,
        sessionId: agent.sessionId,
      });

      setIsInitializing(true);

      // Set loading state in UI store to trigger transition
      const uiStore = useUIStore.getState();
      uiStore.setLoadingConversation(true);
      uiStore.setConversationTransitioning(true);

      postMessage({
        type: 'conversation:load',
        uuid: crypto.randomUUID(),
        session_id: agent.sessionId,
      });
    } else {
      // Agent doesn't have a conversation - create one
      logger.info('Creating new conversation for agent', {
        agentId: agent.id,
        agentName: agent.name,
      });

      setIsInitializing(true);
      const createUuid = crypto.randomUUID();
      pendingCreateUuidRef.current = createUuid;

      postMessage({
        type: 'conversation:create',
        uuid: createUuid,
        title: `Mission: ${agent.name}`,
        workspace_path: workspacePath ?? undefined,
      });
    }

    // NOTE: No cleanup needed for hasInitializedRef
    // - In React Strict Mode, cleanup runs between double-invokes, which would reset the ref
    //   and cause duplicate conversation:create requests (creating orphaned sidebar entries)
    // - When the component truly unmounts, the ref is destroyed anyway
    // - A fresh mount creates a new ref instance with initial value (false)
    // - pendingCreateUuidRef is also not reset - if a request is in-flight during unmount,
    //   the response will be ignored since the handler callback is gone
  }, [agent.id, agent.name, agent.sessionId, postMessage, workspacePath]);

  return {
    isInitializing,
    sessionId: localSessionId,
  };
}
