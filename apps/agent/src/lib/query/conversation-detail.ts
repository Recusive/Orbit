import { queryClient } from './query-client';
import { queryKeys } from './query-keys';

import type { ConversationDto } from '@/lib/api/conversations';

import { conversationLoad } from '@/lib/api/conversations';

export type ConversationDetailResult =
  | { kind: 'data'; conversation: ConversationDto }
  | { kind: 'empty'; conversation: ConversationDto }
  | { kind: 'error' };

function createEmptyConversation(sessionId: string): ConversationDto {
  const now = Date.now();
  return {
    sessionId,
    title: 'Untitled',
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}

function normalizeConversationDetail(
  sessionId: string,
  raw: ConversationDto | null
): ConversationDetailResult {
  if (!raw) {
    return {
      kind: 'empty',
      conversation: createEmptyConversation(sessionId),
    };
  }

  if (raw.messages.length === 0) {
    return { kind: 'empty', conversation: raw };
  }

  return { kind: 'data', conversation: raw };
}

/**
 * Fetch conversation detail through the Query cache.
 *
 * Uses fetchQuery so stale cache entries are refreshed and concurrent callers
 * share the same in-flight request.
 */
export async function loadConversationDetailFresh(
  sessionId: string
): Promise<ConversationDetailResult> {
  try {
    const raw = await queryClient.fetchQuery({
      queryKey: queryKeys.conversations.detail(sessionId),
      queryFn: async ({ signal }) => {
        const result = await conversationLoad(sessionId, undefined, signal);
        return result ?? createEmptyConversation(sessionId);
      },
    });

    return normalizeConversationDetail(sessionId, raw);
  } catch {
    return { kind: 'error' };
  }
}

export async function ensureConversationDetail(
  sessionId: string
): Promise<ConversationDetailResult> {
  return loadConversationDetailFresh(sessionId);
}

export function getFreshConversationDetail(sessionId: string): ConversationDetailResult | null {
  const state = queryClient.getQueryState(queryKeys.conversations.detail(sessionId));
  if (!state || state.isInvalidated || state.status !== 'success') {
    return null;
  }

  const staleTime = queryClient.getDefaultOptions().queries?.staleTime;
  const staleTimeMs = typeof staleTime === 'number' ? staleTime : 0;
  if (Date.now() - state.dataUpdatedAt > staleTimeMs) {
    return null;
  }

  const data = state.data as ConversationDto | undefined;
  if (!data) {
    return null;
  }

  return normalizeConversationDetail(sessionId, data);
}
