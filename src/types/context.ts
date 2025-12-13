import { z } from 'zod';

/**
 * Context types for @ mentions and attached context items
 */

// Supported context types
export const ContextTypeSchema = z.enum(['file', 'folder', 'url', 'code']);
export type ContextType = z.infer<typeof ContextTypeSchema>;

// Context item attached to a message
export const ContextItemSchema = z.object({
  id: z.string(),
  type: ContextTypeSchema,
  name: z.string(), // Display name (filename or URL)
  path: z.string(), // Full path or URL
  icon: z.string().optional(), // Icon name from iconMap
  content: z.string().optional(), // File content (loaded when needed)
  language: z.string().optional(), // Language for code highlighting
});

export type ContextItem = z.infer<typeof ContextItemSchema>;

// File entry from the file list (used in mention popup)
export interface FileEntry {
  path: string;
  name: string;
  isDirectory: boolean;
  icon?: string;
}

// Type guards
export function isFileContext(item: ContextItem): boolean {
  return item.type === 'file';
}

export function isFolderContext(item: ContextItem): boolean {
  return item.type === 'folder';
}

export function isUrlContext(item: ContextItem): boolean {
  return item.type === 'url';
}

export function isCodeContext(item: ContextItem): boolean {
  return item.type === 'code';
}
