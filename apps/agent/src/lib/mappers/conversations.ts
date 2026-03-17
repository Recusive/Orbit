/**
 * Conversation Mappers
 *
 * Pure transformation functions for converting between
 * backend DTOs and frontend types.
 */

import type { ThinkingBlock } from '@/components/chat/messages/types';
import type { ConversationSummaryDto, ThinkingPhaseDto } from '@/lib/api/conversations';

/**
 * Converts an array of ConversationSummaryDto from the backend
 * to the frontend ConversationSummary shape.
 *
 * This eliminates code duplication across multiple files that
 * previously had inline `.map()` calls with the same transformation.
 *
 * CRITICAL: The worktreePath field must be mapped here for sidebar
 * grouping by worktree to work correctly.
 */
export function toConversationSummaries(dtos: ConversationSummaryDto[]): {
  sessionId: string;
  title: string;
  updatedAt: number;
  messageCount: number;
  workspacePath?: string;
  worktreePath?: string;
}[] {
  return dtos.map((c) => ({
    sessionId: c.sessionId,
    title: c.title,
    updatedAt: c.updatedAt,
    messageCount: c.messageCount,
    ...(c.workspacePath !== undefined ? { workspacePath: c.workspacePath } : {}),
    ...(c.worktreePath !== undefined ? { worktreePath: c.worktreePath } : {}),
  }));
}

export function serializeThinkingBlocks(blocks?: ThinkingBlock[]): ThinkingPhaseDto[] | undefined {
  if (!blocks || blocks.length === 0) return undefined;

  return blocks.map((block) => ({
    content: block.content,
    ...(block.contentOffset !== undefined ? { contentOffset: block.contentOffset } : {}),
    ...(block.ordinal !== undefined ? { ordinal: block.ordinal } : {}),
    ...(block.durationMs > 0 ? { durationMs: block.durationMs } : {}),
  }));
}
