/**
 * useAutoStartAgent - Auto-starts review agents when added to canvas
 *
 * When a review agent is added, this hook:
 * 1. Creates a conversation for the agent
 * 2. Fetches the git diff based on review scope
 * 3. Sends the initial review message to start execution
 *
 * This provides the "add and go" workflow where users don't need to
 * manually expand and start the agent - it runs immediately.
 */

import { createLogger } from '@orbit/common/lib';
import { useCallback, useEffect, useRef } from 'react';

import {
  clearPendingAutoStart,
  registerPendingAutoStart,
  registerPendingMessagePersistence,
} from '../lib/auto-start-registry';
import { useMissionsStore } from '../stores/missionsStore';

import type { AgentCard, AgentTypeConfig, ReviewAgentTypeConfig, ReviewScope } from '../types';
import type { ExtensionMessage } from '@/types/protocol';

import { useTauri } from '@/hooks/agent/use-tauri';
import { conversationAddMessage } from '@/lib/api';
import { useToolStore } from '@/stores/agent/tool-store';
import { useUIStore } from '@/stores/ui/ui-store';

const logger = createLogger('AutoStartAgent');

// ============================================================================
// Types
// ============================================================================

interface PendingAutoStart {
  agentId: string;
  typeConfig: ReviewAgentTypeConfig;
  createUuid: string;
}

type PostMessageFn = ReturnType<typeof useTauri>['postMessage'];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate conversation title for auto-started agents
 */
function generateAgentConversationTitle(agentId: string, agentName: string): string {
  const idSuffix = agentId.slice(-8);
  return `Mission: ${agentName} (${idSuffix})`;
}

/**
 * Map review scope to slash command.
 * This mirrors the mapping in AgentExpandedView.tsx.
 */
const REVIEW_SCOPE_SLASH_COMMANDS: Record<ReviewScope, string> = {
  uncommitted: '/review-uncommitted',
  staged: '/review-staged',
  branch: '/review-branch',
  pr: '/review-pr',
  commit: '/review-commit',
};

/**
 * Build the slash command string for a review scope.
 * Just like typing it manually in the Agent tab.
 */
function buildSlashCommand(typeConfig: ReviewAgentTypeConfig): string {
  const baseCommand = REVIEW_SCOPE_SLASH_COMMANDS[typeConfig.reviewScope];

  // Add arguments based on scope type
  switch (typeConfig.reviewScope) {
    case 'branch':
      return typeConfig.baseBranch ? `${baseCommand} ${typeConfig.baseBranch}` : baseCommand;
    case 'pr':
      return typeConfig.prRef ? `${baseCommand} ${typeConfig.prRef}` : baseCommand;
    case 'commit':
      return typeConfig.commitSha ? `${baseCommand} ${typeConfig.commitSha}` : baseCommand;
    case 'uncommitted':
    case 'staged':
    default:
      return baseCommand;
  }
}

/**
 * Type guard for review agent config
 */
function isReviewAgentConfig(config: AgentTypeConfig | undefined): config is ReviewAgentTypeConfig {
  return config?.agentType === 'review';
}

/**
 * Validate that required fields are present for the review scope
 */
function validateReviewConfig(typeConfig: ReviewAgentTypeConfig): {
  valid: boolean;
  error?: string;
} {
  switch (typeConfig.reviewScope) {
    case 'pr':
      // PR number is optional - if empty, /review-pr will use current branch's PR
      return { valid: true };
    case 'commit':
      if (typeConfig.commitSha === undefined || typeConfig.commitSha.trim().length === 0) {
        return { valid: false, error: 'Commit SHA is required for commit review scope' };
      }
      return { valid: true };
    case 'branch':
      if (typeConfig.baseBranch === undefined || typeConfig.baseBranch.trim().length === 0) {
        return { valid: false, error: 'Base branch is required for branch review scope' };
      }
      return { valid: true };
    case 'uncommitted':
    case 'staged':
      return { valid: true };
    default:
      return { valid: true };
  }
}

// ============================================================================
// Hook
// ============================================================================

interface UseAutoStartAgentOptions {
  /** Called when an agent successfully auto-starts */
  onAutoStartComplete?: (agentId: string, sessionId: string) => void;
  /** Called when auto-start fails */
  onAutoStartError?: (agentId: string, error: string) => void;
}

interface UseAutoStartAgentReturn {
  /** Trigger auto-start for a newly added review agent */
  autoStartReviewAgent: (agent: AgentCard, typeConfig: ReviewAgentTypeConfig) => void;
}

export function useAutoStartAgent(options: UseAutoStartAgentOptions = {}): UseAutoStartAgentReturn {
  const { onAutoStartComplete, onAutoStartError } = options;

  // Store actions
  const updateAgent = useMissionsStore((state) => state.updateAgent);
  const setAgentStatus = useMissionsStore((state) => state.setAgentStatus);
  const setAgentError = useMissionsStore((state) => state.setAgentError);

  // UI state
  const workspacePath = useUIStore((state) => state.workspacePath);

  // Track pending auto-starts
  const pendingAutoStartsRef = useRef<Map<string, PendingAutoStart>>(new Map());

  // Ref to store postMessage function to avoid circular dependency
  const postMessageRef = useRef<PostMessageFn | null>(null);

  // Process conversation creation
  // NOTE: This is async to properly await message persistence before sending
  const processConversationCreated = useCallback(
    async (message: ExtensionMessage & { type: 'conversation:created' }): Promise<void> => {
      // Find the pending auto-start that matches this conversation
      let matchingPending: PendingAutoStart | undefined;

      for (const pending of pendingAutoStartsRef.current.values()) {
        const agent = useMissionsStore.getState().agents[pending.agentId];
        if (agent) {
          const expectedTitle = generateAgentConversationTitle(agent.id, agent.name);
          if (message.title === expectedTitle) {
            matchingPending = pending;
            break;
          }
        }
      }

      if (!matchingPending) {
        return;
      }

      const { agentId, typeConfig } = matchingPending;
      const sessionId = message.session_id;

      logger.info('Conversation created for auto-start agent', {
        agentId,
        sessionId,
        reviewScope: typeConfig.reviewScope,
      });

      // Remove from pending
      pendingAutoStartsRef.current.delete(agentId);

      // Build the slash command - just like the user would type it
      // The skill system handles fetching diffs, building context, etc.
      const slashCommand = buildSlashCommand(typeConfig);

      logger.info('Sending slash command for review agent', {
        agentId,
        sessionId,
        slashCommand,
      });

      // Set agent to running
      setAgentStatus(agentId, 'running');

      // Generate a stable user message ID for both persistence and checkpoint tracking
      const userMessageId = crypto.randomUUID();

      // Start persistence immediately and register it BEFORE exposing sessionId to other hooks.
      // This prevents conversation:load from racing ahead of the persisted message.
      const persistPromise = conversationAddMessage(sessionId, {
        id: userMessageId,
        role: 'user',
        content: slashCommand,
        createdAt: Date.now(),
      });
      registerPendingMessagePersistence(sessionId, persistPromise);

      // Save sessionId to agent (after persistence is registered to avoid races)
      updateAgent(agentId, { sessionId });

      // Update global UI state
      const uiStore = useUIStore.getState();
      uiStore.addConversation({
        sessionId,
        title: message.title,
        updatedAt: Date.now(),
        messageCount: 0,
        ...(message.workspace_path ? { workspacePath: message.workspace_path } : {}),
      });

      // Switch tool store session
      const toolStore = useToolStore.getState();
      toolStore.switchSession(sessionId);

      // Clear auto-start pending once the session is registered
      clearPendingAutoStart(agentId);

      // CRITICAL: Persist user message to backend BEFORE sending to agent.
      // We MUST await this to prevent a race condition where:
      // 1. message:send is sent immediately
      // 2. Agent starts streaming response
      // 3. User expands agent view, triggers conversation:load
      // 4. Backend returns empty messages because conversationAddMessage() hasn't completed
      //
      // By awaiting, we guarantee the user message is persisted before the agent starts,
      // so when ChatArea mounts and loads the conversation, the user message will be there.
      try {
        await persistPromise;
      } catch (error) {
        logger.error('Failed to persist user message for auto-start', {
          agentId,
          sessionId,
          error,
        });
        // Continue anyway - the message will be sent, just not persisted
        // User will see it in the current session, but may lose it on refresh
      }

      // Send the slash command via postMessage
      // The skill/command system will handle expansion, diff fetching, etc.
      // Just like when the user types the command manually in the Agent tab
      if (postMessageRef.current) {
        postMessageRef.current({
          type: 'message:send',
          uuid: userMessageId,
          session_id: sessionId,
          content: slashCommand,
        });
      }

      onAutoStartComplete?.(agentId, sessionId);
    },
    [updateAgent, setAgentStatus, onAutoStartComplete]
  );

  // Handle incoming messages
  const handleMessage = useCallback(
    (message: ExtensionMessage): void => {
      // Handle conversation:created - this is when we send the first message
      // NOTE: processConversationCreated is async to await message persistence,
      // but we can't make handleMessage async. We use void to acknowledge
      // the promise is intentionally not awaited (the async work runs independently).
      if (message.type === 'conversation:created') {
        void processConversationCreated(message);
      }
    },
    [processConversationCreated]
  );

  const { postMessage } = useTauri({ onMessage: handleMessage });

  // Store postMessage in ref for use in async callback
  useEffect(() => {
    postMessageRef.current = postMessage;
  }, [postMessage]);

  // Auto-start a review agent
  const autoStartReviewAgent = useCallback(
    (agent: AgentCard, typeConfig: ReviewAgentTypeConfig): void => {
      logger.info('Auto-starting review agent', {
        agentId: agent.id,
        agentName: agent.name,
        reviewScope: typeConfig.reviewScope,
      });

      // Validate required fields before auto-starting
      const validation = validateReviewConfig(typeConfig);
      if (!validation.valid) {
        const errorMsg = validation.error ?? 'Invalid review configuration';
        logger.error('Auto-start validation failed', {
          agentId: agent.id,
          error: errorMsg,
        });
        setAgentStatus(agent.id, 'error');
        setAgentError(agent.id, errorMsg);
        onAutoStartError?.(agent.id, errorMsg);
        return;
      }

      // Set agent status to pending while we create conversation
      setAgentStatus(agent.id, 'pending');

      // Track this pending auto-start
      const createUuid = crypto.randomUUID();
      registerPendingAutoStart(agent.id);
      pendingAutoStartsRef.current.set(agent.id, {
        agentId: agent.id,
        typeConfig,
        createUuid,
      });

      // Create conversation
      postMessage({
        type: 'conversation:create',
        uuid: createUuid,
        title: generateAgentConversationTitle(agent.id, agent.name),
        workspace_path: workspacePath ?? undefined,
      });
    },
    [postMessage, setAgentStatus, setAgentError, workspacePath, onAutoStartError]
  );

  // Cleanup on unmount
  useEffect(() => {
    const pendingMap = pendingAutoStartsRef.current;
    return () => {
      for (const pending of pendingMap.values()) {
        clearPendingAutoStart(pending.agentId);
      }
      pendingMap.clear();
    };
  }, []);

  return {
    autoStartReviewAgent,
  };
}

export { isReviewAgentConfig };
