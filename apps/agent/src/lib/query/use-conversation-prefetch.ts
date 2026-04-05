import { useCallback } from 'react';

import { loadConversationDetailFresh } from './conversation-detail';

/**
 * Stable sidebar prefetch callback for conversation hover/focus.
 *
 * Prefetch is intentionally fire-and-forget. The query layer deduplicates
 * concurrent loads, so a later click can join the in-flight request.
 */
export function useConversationPrefetch(): (sessionId: string) => void {
  return useCallback((sessionId: string): void => {
    void loadConversationDetailFresh(sessionId);
  }, []);
}
