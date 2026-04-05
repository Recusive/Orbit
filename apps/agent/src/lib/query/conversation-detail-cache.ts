import { queryClient } from './query-client';
import { queryKeys } from './query-keys';

import type { ConversationDto, ConversationMessageDto } from '@/lib/api/conversations';

let workspaceEpoch = 0;
const generationMap = new Map<string, number>();

export function getWorkspaceEpoch(): number {
  return workspaceEpoch;
}

export function getConversationGeneration(sessionId: string): number {
  return generationMap.get(sessionId) ?? 0;
}

function bumpGeneration(sessionId: string): number {
  const nextGeneration = getConversationGeneration(sessionId) + 1;
  generationMap.set(sessionId, nextGeneration);
  return nextGeneration;
}

export function appendMessageToConversationCache(
  sessionId: string,
  message: ConversationMessageDto
): void {
  queryClient.setQueryData<ConversationDto | undefined>(
    queryKeys.conversations.detail(sessionId),
    (previous) => {
      if (!previous) {
        return previous;
      }

      return {
        ...previous,
        messages: [...previous.messages, message],
        updatedAt: Date.now(),
      };
    }
  );
}

export function markConversationDirty(sessionId: string): void {
  bumpGeneration(sessionId);
  void queryClient.invalidateQueries({
    queryKey: queryKeys.conversations.detail(sessionId),
  });
}

export async function removeConversationCache(sessionId: string): Promise<void> {
  bumpGeneration(sessionId);
  await queryClient.cancelQueries({
    queryKey: queryKeys.conversations.detail(sessionId),
  });
  queryClient.removeQueries({
    queryKey: queryKeys.conversations.detail(sessionId),
  });
}

export async function invalidateAllConversationCaches(): Promise<void> {
  workspaceEpoch += 1;

  for (const sessionId of Array.from(generationMap.keys())) {
    bumpGeneration(sessionId);
  }

  await queryClient.cancelQueries({
    queryKey: queryKeys.conversations.all,
  });
  void queryClient.invalidateQueries({
    queryKey: queryKeys.conversations.all,
  });
}

export function markConversationTitleDirty(sessionId: string): void {
  markConversationDirty(sessionId);
}
