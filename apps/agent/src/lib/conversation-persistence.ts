/**
 * Conversation persistence tracker
 *
 * Tracks assistant message IDs that were persisted outside ChatArea so we
 * can avoid duplicate writes when buffered events are later replayed.
 */

const persistedKeys = new Set<string>();
const MAX_KEYS = 1000;

function makeKey(sessionId: string, messageId: string): string {
  return `${sessionId}:${messageId}`;
}

export function wasMessagePersisted(sessionId: string, messageId: string): boolean {
  return persistedKeys.has(makeKey(sessionId, messageId));
}

export function markMessagePersisted(sessionId: string, messageId: string): void {
  const key = makeKey(sessionId, messageId);
  persistedKeys.add(key);

  if (persistedKeys.size > MAX_KEYS) {
    const iterator = persistedKeys.values();
    const first = iterator.next().value;
    if (first) {
      persistedKeys.delete(first);
    }
  }
}
