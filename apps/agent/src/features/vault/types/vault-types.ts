import { z } from 'zod';

export const ContentEncodingSchema = z.enum(['utf8', 'base64']);
export type ContentEncoding = z.infer<typeof ContentEncodingSchema>;

export const VaultContentSchema = z
  .object({
    content: z.string(),
    encoding: ContentEncodingSchema,
    isBinary: z.boolean(),
    sizeBytes: z.number(),
  })
  .strict();
export type VaultContent = z.infer<typeof VaultContentSchema>;

export const VaultEntrySchema = z
  .object({
    path: z.string(),
    name: z.string(),
    isDir: z.boolean(),
    sizeBytes: z.number(),
    createdAt: z.number(),
    modifiedAt: z.number(),
    extension: z.string().nullable(),
  })
  .strict();
export type VaultEntry = z.infer<typeof VaultEntrySchema>;

export const VaultListResultSchema = z
  .object({
    entries: z.array(VaultEntrySchema),
    totalCount: z.number(),
    hasMore: z.boolean(),
  })
  .strict();
export type VaultListResult = z.infer<typeof VaultListResultSchema>;

export const WriteResultSchema = z
  .object({
    modifiedAt: z.number(),
  })
  .strict();
export type WriteResult = z.infer<typeof WriteResultSchema>;

export const VaultStatsSchema = z
  .object({
    totalFiles: z.number(),
    totalDirs: z.number(),
    totalSizeBytes: z.number(),
  })
  .strict();
export type VaultStats = z.infer<typeof VaultStatsSchema>;

export const VaultContextConfigSchema = z
  .object({
    version: z.string(),
    includedPaths: z.array(z.string()),
  })
  .strict();
export type VaultContextConfig = z.infer<typeof VaultContextConfigSchema>;

export const ProjectDocSourceSchema = z.enum(['root', 'docs', 'other']);
export type ProjectDocSource = z.infer<typeof ProjectDocSourceSchema>;

export const ProjectDocEntrySchema = z
  .object({
    path: z.string(),
    relativePath: z.string(),
    name: z.string(),
    sizeBytes: z.number(),
    modifiedAt: z.number(),
    source: ProjectDocSourceSchema,
  })
  .strict();
export type ProjectDocEntry = z.infer<typeof ProjectDocEntrySchema>;

export const DocSourceSchema = z.enum(['vault', 'project']);
export type DocSource = z.infer<typeof DocSourceSchema>;

export const VaultSearchResultSchema = z
  .object({
    path: z.string(),
    relativePath: z.string(),
    lineNumber: z.number(),
    lineContent: z.string(),
    source: DocSourceSchema,
  })
  .strict();
export type VaultSearchResult = z.infer<typeof VaultSearchResultSchema>;

export interface UnifiedDoc {
  id: string;
  name: string;
  relativePath: string;
  absolutePath: string;
  source: DocSource;
  isDir: boolean;
  sizeBytes: number;
  modifiedAt: number;
  extension: string | null;
}

export type VaultViewMode = 'unified' | 'vault-only' | 'project-only';
