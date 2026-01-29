import { createLogger } from '@orbit/common/lib';

import type { RewindContextMessage } from './types/tauri-types';
import type { SessionConfig } from '@/lib/api';

import { agentCreateSession, agentGetStoredSession, getWorkspacePath } from '@/lib/api';
import { useToolStore } from '@/stores/agent/tool-store';
import { useUIStore } from '@/stores/ui/ui-store';

const logger = createLogger('TauriSession');

// ═══════════════════════════════════════════════════════════════
// Session State
// ═══════════════════════════════════════════════════════════════

/** Track created sessions to ensure we create before sending */
export const createdSessions = new Set<string>();

/**
 * Track forked sessions that should resume from an SDK session.
 * Key: new (forked) session ID
 * Value: { sdkSessionId } for file checkpoint access (NOT for message resume)
 *
 * IMPORTANT: For rewind scenarios, we DON'T use SDK's resume for messages.
 * The SDK's resume loads ALL messages from the previous session. Instead,
 * we use rewindContextMap to store truncated messages and prepend
 * them to the first message (like Claude Code does).
 */
export const forkedSessionResumeMap = new Map<string, { sdkSessionId: string }>();

/**
 * Store conversation context for rewind scenarios.
 * Key: new (forked) session ID
 * Value: { messages } - conversation history to prepend to first message
 *
 * This is the key fix: Instead of using SDK's resume (which loads ALL messages),
 * we truncate locally and prepend the context to the first message.
 * This matches how Claude Code handles rewind - they slice messages BEFORE
 * passing to the SDK.
 */
export const rewindContextMap = new Map<string, RewindContextMessage[]>();

// NOTE: We don't need to wait for system:init or use delays for forked sessions.
// The SDK's MessageQueue iterator blocks until the first message is added.
// Once we call agentCreateSession(), the session is immediately ready to receive
// messages via queueMessage(). The first message we send unblocks the iterator,
// and the SDK then processes everything (including emitting system:init).

// ═══════════════════════════════════════════════════════════════
// Session Management Functions
// ═══════════════════════════════════════════════════════════════

/** Mark a session as forked from another SDK session (for file checkpointing only) */
export function markSessionAsForked(newSessionId: string, resumeFromSdkSessionId: string): void {
  forkedSessionResumeMap.set(newSessionId, { sdkSessionId: resumeFromSdkSessionId });
  logger.debug('Marked session as forked (for checkpointing)', {
    newSessionId,
    resumeFromSdkSessionId,
  });
}

/**
 * Store conversation context for a rewind fork.
 * This context will be prepended to the first message sent to this session.
 */
export function setRewindContext(sessionId: string, messages: RewindContextMessage[]): void {
  rewindContextMap.set(sessionId, messages);
  logger.debug('Stored rewind context', {
    sessionId,
    messageCount: messages.length,
  });
}

/**
 * Get and consume rewind context for a session.
 * Returns undefined if no context exists.
 * Context is deleted after retrieval (one-time use).
 */
export function consumeRewindContext(sessionId: string): RewindContextMessage[] | undefined {
  const context = rewindContextMap.get(sessionId);
  if (context) {
    rewindContextMap.delete(sessionId);
    logger.debug('Consuming rewind context', {
      sessionId,
      messageCount: context.length,
    });
  }
  return context;
}

/** Ensure a session exists before sending messages */
export async function ensureSession(sessionId: string): Promise<void> {
  if (createdSessions.has(sessionId)) {
    // Session already created and ready
    return;
  }

  // Get current workspace for session config
  // Prefer active worktree path for multi-agent isolation, fall back to workspace
  const activeWorktreePath = useUIStore.getState().activeWorktreePath;
  const cwd = activeWorktreePath ?? (await getWorkspacePath());

  // Get current mode settings from tool store
  // This ensures Plan agents (and any user-selected mode) are applied at session creation
  const toolState = useToolStore.getState();
  const inputMode = toolState.inputMode;

  // Build config with optional cwd and current mode settings
  const config: SessionConfig = {
    model: toolState.model,
    thinkingEnabled: toolState.thinkingMode !== 'off',
    acceptEnabled: inputMode === 'accept',
    planEnabled: inputMode === 'plan',
  };
  if (cwd) {
    config.cwd = cwd;
  }

  // Check if this is a forked session (from rewind)
  // NOTE: We intentionally DON'T use SDK's resume for rewind sessions.
  // The SDK's resume loads ALL messages from the previous session, which breaks rewind.
  // Instead, we:
  // 1. Store the truncated messages in rewindContextMap
  // 2. Create a fresh session (no resume)
  // 3. Prepend the context to the first message
  // This matches how Claude Code handles rewind - they slice messages BEFORE passing to SDK.
  const resumeConfig = forkedSessionResumeMap.get(sessionId);

  if (resumeConfig) {
    // For rewind forks, we create a FRESH session (no SDK resume)
    // The conversation context is handled by prepending to the first message
    // File checkpoints were already rewound before the fork was created
    logger.debug('Creating fresh session for rewind fork', {
      sessionId,
      originalSdkSession: resumeConfig.sdkSessionId,
      note: 'NOT using SDK resume - context will be prepended to first message',
    });
    // Clean up the mapping
    forkedSessionResumeMap.delete(sessionId);
  } else {
    // Not a rewind fork — check if we have a persisted SDK session to resume.
    // This handles the app restart case: sessionId survives in localStorage,
    // messages are loaded from the backend store, but the SDK session was lost
    // when the agent-bridge process restarted. The SDK session ID is persisted
    // in orbit-sessions.json and can be used to resume with full context.
    try {
      const storedSdkSessionId = await agentGetStoredSession(sessionId);
      if (storedSdkSessionId) {
        config.resumeSessionId = storedSdkSessionId;
        logger.info('Resuming SDK session after restart', {
          sessionId,
          sdkSessionId: storedSdkSessionId,
        });
      }
    } catch {
      // If lookup fails (e.g., bridge not ready), proceed without resume.
      // The session will work but Claude won't have previous context.
      logger.warn('Could not look up stored SDK session, creating fresh', { sessionId });
    }
  }

  await agentCreateSession(sessionId, config);

  createdSessions.add(sessionId);

  // Record session → worktree association for multi-agent isolation
  if (activeWorktreePath) {
    useUIStore.getState().recordSessionWorktree(sessionId, activeWorktreePath);
  }

  // Session is immediately ready to receive messages after agentCreateSession() returns.
  // The SDK's MessageQueue is created and waiting for messages. When we send the first
  // message, it unblocks the iterator, and the SDK starts processing (including system:init).
  logger.debug('Session created and ready', { sessionId });
}
