import { z } from 'zod';

/**
 * Context types for @ mentions and attached context items
 */

// Supported context types
export const ContextTypeSchema = z.enum(['file', 'folder', 'url', 'code', 'image']);
export type ContextType = z.infer<typeof ContextTypeSchema>;

// Context item attached to a message
export const ContextItemSchema = z
  .object({
    id: z.string(),
    type: ContextTypeSchema,
    name: z.string(), // Display name (filename or URL)
    path: z.string(), // Full path or URL
    icon: z.string().optional(), // Icon name from iconMap
    content: z.string().optional(), // File content (loaded when needed)
    language: z.string().optional(), // Language for code highlighting
    // Image-specific fields
    imageData: z.string().optional(), // Base64 encoded image data
    mimeType: z.string().optional(), // Image MIME type (image/png, image/jpeg, etc.)
    previewUrl: z.string().optional(), // Data URL for preview display
  })
  .strict();

export type ContextItem = z.infer<typeof ContextItemSchema>;

// File entry from the file list (used in mention popup)
export const FileEntrySchema = z
  .object({
    path: z.string(),
    name: z.string(),
    isDirectory: z.boolean(),
    icon: z.string().optional(),
  })
  .strict();
export type FileEntry = z.infer<typeof FileEntrySchema>;

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

export function isImageContext(item: ContextItem): boolean {
  return item.type === 'image';
}
