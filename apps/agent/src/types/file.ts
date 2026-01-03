import { FileDataSchema } from '@snowflake/shared-schemas';
import { z } from 'zod';

import type { FileData } from '@snowflake/shared-schemas';

// Re-export the shared FileDataSchema with an alias for backwards compatibility
export { FileDataSchema, type FileData } from '@snowflake/shared-schemas';

/**
 * @deprecated Use FileDataSchema from @snowflake/shared-schemas instead
 * This alias exists for backwards compatibility
 */
export const FileContentSchema = FileDataSchema;
export type FileContent = FileData;

/**
 * File status enum
 */
export enum FileStatus {
  CREATED = 'created',
  MODIFIED = 'modified',
  DELETED = 'deleted',
  RENAMED = 'renamed',
  UNCHANGED = 'unchanged',
}

/**
 * File operation type enum
 */
export enum FileOperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  RENAME = 'rename',
  MOVE = 'move',
  COPY = 'copy',
}

/**
 * File metadata schema
 */
export const FileMetadataSchema = z
  .object({
    path: z.string(),
    name: z.string(),
    extension: z.string().optional(),
    size: z.number(),
    createdAt: z.number().optional(),
    modifiedAt: z.number().optional(),
    isDirectory: z.boolean(),
    isSymlink: z.boolean().optional(),
    permissions: z.string().optional(),
    mimeType: z.string().optional(),
    language: z.string().optional(),
  })
  .strict();

/**
 * File change schema
 */
export const FileChangeSchema = z
  .object({
    id: z.string(),
    path: z.string(),
    status: z.enum(FileStatus),
    oldPath: z.string().optional(), // For rename/move operations
    timestamp: z.number(),
    changes: z
      .object({
        linesAdded: z.number().optional(),
        linesRemoved: z.number().optional(),
        linesChanged: z.number().optional(),
      })
      .strict()
      .optional(),
    diff: z.string().optional(),
  })
  .strict();

/**
 * File operation schema
 */
export const FileOperationSchema = z
  .object({
    id: z.string(),
    type: z.enum(FileOperationType),
    path: z.string(),
    timestamp: z.number(),
    status: z.enum(['pending', 'in_progress', 'completed', 'failed']),
    error: z.string().optional(),
    metadata: z
      .object({
        newPath: z.string().optional(), // For rename/move/copy
        content: z.string().optional(), // For create/update
        backup: z.boolean().optional(),
        force: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

/**
 * File tree node type
 */
export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  children?: FileTreeNode[];
  expanded?: boolean;
  metadata?: FileMetadata;
}

/**
 * File tree node schema
 * Note: Using type assertion to handle recursive Zod schema with optional properties
 */
export const FileTreeNodeSchema: z.ZodType<FileTreeNode> = z.lazy(() =>
  z
    .object({
      name: z.string(),
      path: z.string(),
      type: z.enum(['file', 'directory']),
      size: z.number().optional(),
      children: z.array(FileTreeNodeSchema).optional(),
      expanded: z.boolean().optional(),
      metadata: FileMetadataSchema.optional(),
    })
    .strict()
) as z.ZodType<FileTreeNode>;

/**
 * File search result schema
 */
export const FileSearchResultSchema = z
  .object({
    path: z.string(),
    matches: z.array(
      z.object({
        line: z.number(),
        column: z.number(),
        text: z.string(),
        context: z
          .object({
            before: z.array(z.string()).optional(),
            after: z.array(z.string()).optional(),
          })
          .strict()
          .optional(),
      })
    ),
    score: z.number().optional(),
  })
  .strict();

/**
 * File diff stats schema
 */
export const FileDiffStatsSchema = z
  .object({
    path: z.string(),
    status: z.enum(FileStatus),
    additions: z.number(),
    deletions: z.number(),
    changes: z.number(),
  })
  .strict();

/**
 * File upload schema
 */
export const FileUploadSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    size: z.number(),
    type: z.string(),
    status: z.enum(['pending', 'uploading', 'completed', 'failed']),
    progress: z.number().min(0).max(100),
    error: z.string().optional(),
    url: z.string().optional(),
  })
  .strict();

/**
 * TypeScript types inferred from Zod schemas
 * Note: FileContent and FileData are exported at the top of the file from shared-schemas
 */
export type FileMetadata = z.infer<typeof FileMetadataSchema>;
export type FileChange = z.infer<typeof FileChangeSchema>;
export type FileOperation = z.infer<typeof FileOperationSchema>;
export type FileSearchResult = z.infer<typeof FileSearchResultSchema>;
export type FileDiffStats = z.infer<typeof FileDiffStatsSchema>;
export type FileUpload = z.infer<typeof FileUploadSchema>;

/**
 * Helper functions
 */
export function getFileExtension(path: string): string | undefined {
  const match = /\.([^.]+)$/.exec(path);
  return match ? match[1] : undefined;
}

export function getFileName(path: string): string {
  return path.split('/').pop() ?? path;
}

export function getFileDirectory(path: string): string {
  const parts = path.split('/');
  parts.pop();
  return parts.join('/') || '/';
}

export function isImageFile(path: string): boolean {
  const ext = getFileExtension(path)?.toLowerCase();
  return ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(ext ?? '');
}

export function isCodeFile(path: string): boolean {
  const ext = getFileExtension(path)?.toLowerCase();
  return [
    'js',
    'jsx',
    'ts',
    'tsx',
    'py',
    'java',
    'c',
    'cpp',
    'cs',
    'go',
    'rs',
    'rb',
    'php',
    'swift',
    'kt',
    'scala',
    'html',
    'css',
    'scss',
    'sass',
    'less',
    'json',
    'xml',
    'yaml',
    'yml',
    'md',
    'sh',
    'bash',
    'zsh',
  ].includes(ext ?? '');
}

export function getLanguageFromExtension(extension: string): string | undefined {
  const languageMap: Record<string, string> = {
    // JavaScript variants
    js: 'javascript',
    jsx: 'javascriptreact',
    mjs: 'javascript',
    cjs: 'javascript',
    // TypeScript variants
    ts: 'typescript',
    tsx: 'typescriptreact',
    mts: 'typescript',
    cts: 'typescript',
    // Languages
    py: 'python',
    pyw: 'python',
    pyi: 'python',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    cc: 'cpp',
    cxx: 'cpp',
    h: 'c',
    hpp: 'cpp',
    cs: 'csharp',
    go: 'go',
    rs: 'rust',
    rb: 'ruby',
    php: 'php',
    swift: 'swift',
    kt: 'kotlin',
    kts: 'kotlin',
    scala: 'scala',
    // Web
    html: 'html',
    htm: 'html',
    // Styles
    css: 'css',
    scss: 'scss',
    sass: 'scss',
    less: 'less',
    // Data formats
    json: 'json',
    jsonc: 'json',
    xml: 'xml',
    svg: 'xml',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    // Docs
    md: 'markdown',
    mdx: 'markdown',
    // Shell
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    fish: 'bash',
  };

  return languageMap[extension.toLowerCase()];
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = sizes[i];

  return `${String(Math.round((bytes / Math.pow(k, i)) * 100) / 100)} ${size ?? ''}`;
}

export function sortFileTreeNodes(nodes: FileTreeNode[]): FileTreeNode[] {
  return [...nodes].sort((a, b) => {
    // Directories first
    if (a.type === 'directory' && b.type === 'file') return -1;
    if (a.type === 'file' && b.type === 'directory') return 1;

    // Then alphabetically
    return a.name.localeCompare(b.name);
  });
}

export function flattenFileTree(
  node: FileTreeNode,
  depth = 0
): (FileTreeNode & { depth: number })[] {
  const result: (FileTreeNode & { depth: number })[] = [{ ...node, depth }];

  if (node.children && node.expanded) {
    for (const child of node.children) {
      result.push(...flattenFileTree(child, depth + 1));
    }
  }

  return result;
}
