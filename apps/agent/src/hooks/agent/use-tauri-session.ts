import type { RewindContextMessage } from './types/tauri-types';
import type { SessionConfig } from '@/lib/api';

import { agentCreateSession, getWorkspacePath } from '@/lib/api';

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
  console.warn('[Orbit] Marked session as forked (for checkpointing):', {
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
  console.warn('[Orbit] Stored rewind context:', {
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
    console.warn('[Orbit] Consuming rewind context:', {
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
  const cwd = await getWorkspacePath();

  // Build config with optional cwd
  // Start in default mode (requires permission approval for each tool)
  const config: SessionConfig = {
    model: 'sonnet',
    thinkingEnabled: false,
    acceptEnabled: false,
    planEnabled: false,
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
    console.warn('[Orbit] Creating fresh session for rewind fork:', {
      sessionId,
      originalSdkSession: resumeConfig.sdkSessionId,
      note: 'NOT using SDK resume - context will be prepended to first message',
    });
    // Clean up the mapping
    forkedSessionResumeMap.delete(sessionId);
  }

  await agentCreateSession(sessionId, config);

  createdSessions.add(sessionId);

  // Session is immediately ready to receive messages after agentCreateSession() returns.
  // The SDK's MessageQueue is created and waiting for messages. When we send the first
  // message, it unblocks the iterator, and the SDK starts processing (including system:init).
  console.warn('[Orbit] Session created and ready:', sessionId);
}
