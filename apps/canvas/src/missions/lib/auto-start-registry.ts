/**
 * Auto-start registry
 *
 * Tracks pending auto-start creation and message persistence so hooks can
 * coordinate without additional store state.
 */

/** Timeout for message persistence to prevent hung promises blocking loads forever (30s) */
const PERSISTENCE_TIMEOUT_MS = 30000;

/** Timeout for auto-start to complete before clearing pending state (60s) */
const AUTO_START_TIMEOUT_MS = 60000;

/** Map of agentId to timestamp when auto-start was registered */
const pendingAutoStarts = new Map<string, number>();
const pendingMessagePersistence = new Map<string, Promise<void>>();

/**
 * Register an auto-start with timeout protection.
 *
 * If the auto-start doesn't complete (conversation:created not received),
 * isAutoStartPending will auto-clear after timeout to prevent permanent blocking.
 */
export function registerPendingAutoStart(agentId: string): void {
  pendingAutoStarts.set(agentId, Date.now());
}

export function clearPendingAutoStart(agentId: string): void {
  pendingAutoStarts.delete(agentId);
}

export function isAutoStartPending(agentId: string): boolean {
  const timestamp = pendingAutoStarts.get(agentId);
  if (timestamp === undefined) {
    return false;
  }

  // Check if auto-start has timed out
  const age = Date.now() - timestamp;
  if (age >= AUTO_START_TIMEOUT_MS) {
    // Auto-clear expired entry
    pendingAutoStarts.delete(agentId);
    return false;
  }

  return true;
}

/**
 * Register a message persistence promise with timeout protection.
 *
 * If the promise never settles (hung network), the timeout ensures the registry
 * entry is cleaned up and waitForPendingMessagePersistence won't block forever.
 */
export function registerPendingMessagePersistence(sessionId: string, promise: Promise<void>): void {
  // Wrap in a race with timeout to prevent hung promises blocking loads forever
  const timeoutPromise = Promise.race([
    promise,
    new Promise<void>((_, reject) => {
      setTimeout(() => {
        reject(new Error('Message persistence timeout'));
      }, PERSISTENCE_TIMEOUT_MS);
    }),
  ]);

  pendingMessagePersistence.set(sessionId, timeoutPromise);

  void timeoutPromise
    .catch(() => {
      // Ignore timeout/errors - the caller will handle them
    })
    .finally(() => {
      const current = pendingMessagePersistence.get(sessionId);
      if (current === timeoutPromise) {
        pendingMessagePersistence.delete(sessionId);
      }
    });
}

export async function waitForPendingMessagePersistence(sessionId: string): Promise<void> {
  const pending = pendingMessagePersistence.get(sessionId);
  if (pending) {
    await pending;
  }
}
