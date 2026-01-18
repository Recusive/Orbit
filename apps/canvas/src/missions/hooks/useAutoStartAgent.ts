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

import { fetchDiffForReview, getReviewScopeDescription } from '../lib/git-diff';
import { useMissionsStore } from '../stores/missionsStore';

import type { AgentCard, AgentTypeConfig, ReviewAgentTypeConfig } from '../types';
import type { ExtensionMessage } from '@/types/protocol';

import { useTauri } from '@/hooks/agent/use-tauri';
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
 * Build the initial review message with diff context
 */
function buildReviewMessage(
  diffResult: {
    success: boolean;
    diff: string;
    description: string;
    filesChanged: number;
    linesAdded: number;
    linesRemoved: number;
  },
  scopeDescription: string
): string {
  if (!diffResult.success || diffResult.diff.length === 0) {
    return `## Code Review Request

No changes found for ${scopeDescription}.

Please let me know if you'd like me to review something specific.`;
  }

  return `## Code Review Request

I need you to review ${scopeDescription}.

### Statistics
- Files changed: ${String(diffResult.filesChanged)}
- Lines added: +${String(diffResult.linesAdded)}
- Lines removed: -${String(diffResult.linesRemoved)}

### Diff
\`\`\`diff
${diffResult.diff}
\`\`\`

---

Please provide a thorough code review covering:
1. **Bugs & Logic Errors** - Any potential bugs or incorrect logic
2. **Security Issues** - Any security vulnerabilities
3. **Performance** - Any performance concerns
4. **Code Quality** - Readability, maintainability, best practices
5. **Suggestions** - Specific improvements with code examples

Focus on actionable feedback. If the code looks good, say so briefly.`;
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
      if (typeConfig.prRef === undefined || typeConfig.prRef.trim().length === 0) {
        return { valid: false, error: 'PR reference is required for PR review scope' };
      }
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

  // Process conversation creation - this is async but wrapped to be called from sync handler
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

      // Save sessionId to agent
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

      // Now fetch the diff and send the first message
      const repoPath = workspacePath ?? process.cwd();

      logger.info('Fetching diff for review agent', {
        agentId,
        repoPath,
        reviewScope: typeConfig.reviewScope,
      });

      try {
        const diffResult = await fetchDiffForReview(repoPath, typeConfig);
        const scopeDescription = getReviewScopeDescription(typeConfig.reviewScope, typeConfig);
        const reviewMessage = buildReviewMessage(diffResult, scopeDescription);

        logger.info('Sending initial review message', {
          agentId,
          sessionId,
          filesChanged: diffResult.filesChanged,
          messageLength: reviewMessage.length,
        });

        // Set agent to running
        setAgentStatus(agentId, 'running');

        // Send the message via postMessage
        // This will trigger the agent execution via the normal flow
        if (postMessageRef.current) {
          postMessageRef.current({
            type: 'message:send',
            uuid: crypto.randomUUID(),
            session_id: sessionId,
            content: reviewMessage,
          });
        }

        onAutoStartComplete?.(agentId, sessionId);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error('Failed to auto-start review agent', { agentId, error: errorMsg });

        setAgentStatus(agentId, 'error');
        setAgentError(agentId, `Failed to start review: ${errorMsg}`);

        onAutoStartError?.(agentId, errorMsg);
      }
    },
    [
      updateAgent,
      setAgentStatus,
      setAgentError,
      workspacePath,
      onAutoStartComplete,
      onAutoStartError,
    ]
  );

  // Handle incoming messages - sync wrapper around async processing
  const handleMessage = useCallback(
    (message: ExtensionMessage): void => {
      // Handle conversation:created - this is when we send the first message
      if (message.type === 'conversation:created') {
        // Fire and forget - errors are handled inside
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
        logger.error('Auto-start validation failed', {
          agentId: agent.id,
          error: validation.error,
        });
        setAgentStatus(agent.id, 'error');
        setAgentError(agent.id, validation.error ?? 'Invalid review configuration');
        return;
      }

      // Set agent status to pending while we create conversation
      setAgentStatus(agent.id, 'pending');

      // Track this pending auto-start
      const createUuid = crypto.randomUUID();
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
    [postMessage, setAgentStatus, setAgentError, workspacePath]
  );

  // Cleanup on unmount
  useEffect(() => {
    const pendingMap = pendingAutoStartsRef.current;
    return () => {
      pendingMap.clear();
    };
  }, []);

  return {
    autoStartReviewAgent,
  };
}

export { isReviewAgentConfig };
