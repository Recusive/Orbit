import { createLogger } from '@orbit/common/lib';

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
 * Value: { sdkSessionId } for file checkpoint access
 *
 * NOTE: The new rewind system uses parentUuid chains (like Claude Code)
 * instead of context prepending. This map is kept for file checkpoint tracking.
 */
export const forkedSessionResumeMap = new Map<string, { sdkSessionId: string }>();

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

/** Remap a created session from oldId to newId (e.g., Orbit UUID → SDK session ID).
 *  This keeps ensureSession() from re-creating the session under the new ID. */
export function remapCreatedSession(oldId: string, newId: string): void {
  if (createdSessions.has(oldId)) {
    createdSessions.delete(oldId);
    createdSessions.add(newId);
    logger.debug('Remapped created session', { oldId, newId });
  }
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
  // For forks, we RESUME from the original SDK session to preserve conversation context.
  // The parentUuid chain determines what the UI shows, but Claude needs the full context.
  const resumeConfig = forkedSessionResumeMap.get(sessionId);

  if (resumeConfig) {
    // For rewind forks, resume from the original SDK session so Claude has context.
    // This is critical: without resuming, Claude has no idea what the conversation was about.
    // The parentUuid chain (like Claude Code) tells OUR UI which messages to show,
    // but the SDK session must have the full conversation for Claude to understand context.
    config.resumeSessionId = resumeConfig.sdkSessionId;
    logger.debug('Resuming SDK session for rewind fork (preserving context)', {
      sessionId,
      resumeFromSdkSessionId: resumeConfig.sdkSessionId,
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
