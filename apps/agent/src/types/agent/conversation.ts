import { z } from 'zod';

import { MessageSchema } from '../protocol/message';

/**
 * Workspace configuration schema
 */
export const WorkspaceConfigSchema = z
  .object({
    name: z.string(),
    rootPath: z.string(),
    language: z.string().optional(),
    framework: z.string().optional(),
    packageManager: z.string().optional(),
    gitRepository: z.string().optional(),
    gitBranch: z.string().optional(),
    excludePatterns: z.array(z.string()).optional(),
    includePatterns: z.array(z.string()).optional(),
    customSettings: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

/**
 * Workspace schema
 */
export const WorkspaceSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    rootPath: z.string(),
    config: WorkspaceConfigSchema.optional(),
    createdAt: z.number(),
    updatedAt: z.number(),
    metadata: z
      .object({
        fileCount: z.number().optional(),
        totalSize: z.number().optional(),
        languages: z.array(z.string()).optional(),
        frameworks: z.array(z.string()).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

/**
 * Conversation metadata schema
 */
export const ConversationMetaSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    workspaceId: z.string().optional(),
    createdAt: z.number(),
    updatedAt: z.number(),
    messageCount: z.number(),
    lastMessagePreview: z.string().optional(),
    tags: z.array(z.string()).optional(),
    pinned: z.boolean().optional(),
    archived: z.boolean().optional(),
  })
  .strict();

/**
 * Conversation schema
 */
export const ConversationSchema = ConversationMetaSchema.extend({
  messages: z.array(MessageSchema),
  workspace: WorkspaceSchema.optional(),
  context: z
    .object({
      files: z.array(z.string()).optional(),
      activeTasks: z.array(z.string()).optional(),
      pinnedFiles: z.array(z.string()).optional(),
      environment: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
  settings: z
    .object({
      model: z.string().optional(),
      temperature: z.number().min(0).max(2).optional(),
      maxTokens: z.number().optional(),
      systemPrompt: z.string().optional(),
      toolsEnabled: z.boolean().optional(),
      autoSave: z.boolean().optional(),
    })
    .optional(),
});

/**
 * Conversation summary schema (for lists)
 */
export const ConversationSummarySchema = z
  .object({
    id: z.string(),
    title: z.string(),
    workspaceId: z.string().optional(),
    workspaceName: z.string().optional(),
    createdAt: z.number(),
    updatedAt: z.number(),
    messageCount: z.number(),
    lastMessagePreview: z.string().optional(),
    tags: z.array(z.string()).optional(),
    pinned: z.boolean().optional(),
    archived: z.boolean().optional(),
    unreadCount: z.number().optional(),
  })
  .strict();

/**
 * Conversation filter schema
 */
export const ConversationFilterSchema = z
  .object({
    workspaceId: z.string().optional(),
    tags: z.array(z.string()).optional(),
    searchQuery: z.string().optional(),
    pinned: z.boolean().optional(),
    archived: z.boolean().optional(),
    dateFrom: z.number().optional(),
    dateTo: z.number().optional(),
    sortBy: z.enum(['createdAt', 'updatedAt', 'messageCount', 'title']).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  })
  .strict();

/**
 * TypeScript types inferred from Zod schemas
 */
export type WorkspaceConfig = z.infer<typeof WorkspaceConfigSchema>;
export type Workspace = z.infer<typeof WorkspaceSchema>;
export type ConversationMeta = z.infer<typeof ConversationMetaSchema>;
export type Conversation = z.infer<typeof ConversationSchema>;
export type ConversationSummary = z.infer<typeof ConversationSummarySchema>;
export type ConversationFilter = z.infer<typeof ConversationFilterSchema>;

/**
 * Helper functions for conversation operations
 */
export function createEmptyConversation(
  id: string,
  workspaceId?: string,
  title?: string
): Conversation {
  const now = Date.now();
  return {
    id,
    title: title ?? 'New Conversation',
    workspaceId,
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
    messages: [],
    pinned: false,
    archived: false,
  };
}

export function getConversationSummary(conversation: Conversation): ConversationSummary {
  const lastMessage = conversation.messages[conversation.messages.length - 1];
  const lastMessagePreview = lastMessage
    ? lastMessage.content
        .map((c) => {
          if ('text' in c) return c.text;
          return `[${c.type}]`;
        })
        .join(' ')
        .slice(0, 100)
    : undefined;

  return {
    id: conversation.id,
    title: conversation.title,
    workspaceId: conversation.workspaceId,
    workspaceName: conversation.workspace?.name,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messageCount: conversation.messageCount,
    lastMessagePreview,
    tags: conversation.tags,
    pinned: conversation.pinned,
    archived: conversation.archived,
  };
}

export function filterConversations(
  conversations: ConversationSummary[],
  filter: ConversationFilter
): ConversationSummary[] {
  // Single-pass filter: combine all filter conditions into one pass
  // This avoids multiple array iterations and ensures we create a new array
  const hasFilters =
    filter.workspaceId !== undefined ||
    (filter.tags !== undefined && filter.tags.length > 0) ||
    filter.searchQuery !== undefined ||
    filter.pinned !== undefined ||
    filter.archived !== undefined ||
    filter.dateFrom !== undefined ||
    filter.dateTo !== undefined;

  const searchQuery = filter.searchQuery?.toLowerCase();
  const tags = filter.tags;
  const dateFrom = filter.dateFrom;
  const dateTo = filter.dateTo;

  // Filter in a single pass if we have filters, otherwise just copy the array
  const filtered = hasFilters
    ? conversations.filter((c) => {
        // Workspace filter
        if (filter.workspaceId !== undefined && c.workspaceId !== filter.workspaceId) {
          return false;
        }
        // Tags filter
        if (tags !== undefined && tags.length > 0) {
          if (!tags.some((tag) => c.tags?.includes(tag))) {
            return false;
          }
        }
        // Search query filter
        if (searchQuery !== undefined) {
          if (
            !c.title.toLowerCase().includes(searchQuery) &&
            !c.lastMessagePreview?.toLowerCase().includes(searchQuery)
          ) {
            return false;
          }
        }
        // Pinned filter
        if (filter.pinned !== undefined && c.pinned !== filter.pinned) {
          return false;
        }
        // Archived filter
        if (filter.archived !== undefined && c.archived !== filter.archived) {
          return false;
        }
        // Date range filters
        if (dateFrom !== undefined && c.createdAt < dateFrom) {
          return false;
        }
        if (dateTo !== undefined && c.createdAt > dateTo) {
          return false;
        }
        return true;
      })
    : [...conversations]; // Create a new array even if no filters to avoid mutation

  // Sort using toSorted() for immutability (ES2023)
  // Falls back to spread + sort for older targets
  const sortBy = filter.sortBy ?? 'updatedAt';
  const sortOrder = filter.sortOrder ?? 'desc';

  const compareFn = (a: ConversationSummary, b: ConversationSummary): number => {
    let aVal: string | number;
    let bVal: string | number;

    switch (sortBy) {
      case 'title':
        aVal = a.title.toLowerCase();
        bVal = b.title.toLowerCase();
        break;
      case 'messageCount':
        aVal = a.messageCount;
        bVal = b.messageCount;
        break;
      case 'createdAt':
        aVal = a.createdAt;
        bVal = b.createdAt;
        break;
      case 'updatedAt':
      default:
        aVal = a.updatedAt;
        bVal = b.updatedAt;
        break;
    }

    if (sortOrder === 'asc') {
      return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    } else {
      return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
    }
  };

  // Use toSorted if available (ES2023+), otherwise spread + sort
  return 'toSorted' in Array.prototype
    ? (
        filtered as unknown as { toSorted: (fn: typeof compareFn) => ConversationSummary[] }
      ).toSorted(compareFn)
    : [...filtered].sort(compareFn);
}
