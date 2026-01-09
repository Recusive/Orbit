/**
 * Conversation Mappers
 *
 * Pure transformation functions for converting between
 * backend DTOs and frontend types.
 */

import type { ConversationSummaryDto } from '@/lib/api/conversations';

/**
 * Converts an array of ConversationSummaryDto from the backend
 * to the frontend ConversationSummary shape.
 *
 * This eliminates code duplication across multiple files that
 * previously had inline `.map()` calls with the same transformation.
 */
export function toConversationSummaries(dtos: ConversationSummaryDto[]): {
  sessionId: string;
  title: string;
  updatedAt: number;
  messageCount: number;
  workspacePath?: string;
}[] {
  return dtos.map((c) => ({
    sessionId: c.sessionId,
    title: c.title,
    updatedAt: c.updatedAt,
    messageCount: c.messageCount,
    ...(c.workspacePath !== undefined ? { workspacePath: c.workspacePath } : {}),
  }));
}
