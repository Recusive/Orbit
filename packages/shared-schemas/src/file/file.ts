import { z } from 'zod';

/**
 * Validated file path with security refinements
 * Prevents path traversal attacks and invalid characters
 */
export const FilePathSchema = z
  .string()
  .min(1, 'File path cannot be empty')
  .refine((path) => !path.includes('..'), {
    message: 'Path cannot contain parent directory traversal (..)',
  })
  .refine(
    (path) => {
      // Check for invalid Windows filename characters and control characters (0-31)
      const invalidChars = ['<', '>', ':', '"', '|', '?', '*'];
      if (invalidChars.some((char) => path.includes(char))) return false;
      // Check for control characters (code points 0-31)
      for (const char of path) {
        if (char.charCodeAt(0) < 32) return false;
      }
      return true;
    },
    { message: 'Path contains invalid characters' }
  )
  .brand<'FilePath'>();
export type FilePath = z.infer<typeof FilePathSchema>;

/**
 * Create a branded FilePath from a string (validates)
 */
export function createFilePath(value: string): FilePath {
  return FilePathSchema.parse(value);
}

/**
 * Safely parse a file path, returning null on failure
 */
export function safeFilePath(value: string): FilePath | null {
  const result = FilePathSchema.safeParse(value);
  return result.success ? result.data : null;
}

/**
 * File status for tracking changes
 */
export const FileStatusSchema = z.enum(['created', 'modified', 'deleted', 'renamed', 'unchanged']);
export type FileStatus = z.infer<typeof FileStatusSchema>;

/**
 * Generic file content (for file operations)
 */
export const FileDataSchema = z
  .object({
    path: z.string(),
    content: z.string(),
    encoding: z.string().optional().default('utf-8'),
    mimeType: z.string().optional(),
    size: z.number().optional(),
    hash: z.string().optional(),
  })
  .strict();
export type FileData = z.infer<typeof FileDataSchema>;
