import { z } from 'zod';

/**
 * Diff line type enum
 */
export enum DiffLineType {
  ADDED = 'added',
  REMOVED = 'removed',
  CONTEXT = 'context',
  HEADER = 'header',
  HUNK_HEADER = 'hunkHeader',
}

/**
 * Diff change type enum
 */
export enum DiffChangeType {
  ADD = 'add',
  DELETE = 'delete',
  MODIFY = 'modify',
  RENAME = 'rename',
  COPY = 'copy',
}

/**
 * Diff line schema
 */
export const DiffLineSchema = z.object({
  type: z.enum(DiffLineType),
  content: z.string(),
  oldLineNumber: z.number().optional(),
  newLineNumber: z.number().optional(),
  isTrailingWhitespace: z.boolean().optional(),
  isNoNewlineAtEndOfFile: z.boolean().optional(),
});

/**
 * Diff hunk schema
 */
export const DiffHunkSchema = z.object({
  oldStart: z.number(),
  oldLines: z.number(),
  newStart: z.number(),
  newLines: z.number(),
  header: z.string(),
  lines: z.array(DiffLineSchema),
  context: z.string().optional(),
});

/**
 * File diff schema
 */
export const FileDiffSchema = z.object({
  oldPath: z.string(),
  newPath: z.string(),
  changeType: z.enum(DiffChangeType),
  hunks: z.array(DiffHunkSchema),
  additions: z.number(),
  deletions: z.number(),
  isBinary: z.boolean().optional(),
  oldMode: z.string().optional(),
  newMode: z.string().optional(),
  similarity: z.number().optional(), // For rename/copy operations
  checksum: z.string().optional(),
});

/**
 * Diff summary schema
 */
export const DiffSummarySchema = z.object({
  totalFiles: z.number(),
  additions: z.number(),
  deletions: z.number(),
  filesChanged: z.number(),
  files: z.array(
    z.object({
      path: z.string(),
      additions: z.number(),
      deletions: z.number(),
      changeType: z.enum(DiffChangeType),
    })
  ),
});

/**
 * Inline diff schema (for side-by-side view)
 */
export const InlineDiffSchema = z.object({
  oldContent: z.string(),
  newContent: z.string(),
  changes: z.array(
    z.object({
      type: z.enum(['insert', 'delete', 'equal']),
      value: z.string(),
      oldIndex: z.number().optional(),
      newIndex: z.number().optional(),
    })
  ),
});

/**
 * Diff conflict schema
 */
export const DiffConflictSchema = z.object({
  filePath: z.string(),
  startLine: z.number(),
  endLine: z.number(),
  currentContent: z.string(),
  incomingContent: z.string(),
  baseContent: z.string().optional(),
  resolved: z.boolean(),
  resolution: z.string().optional(),
});

/**
 * Diff view preferences schema
 */
export const DiffViewPreferencesSchema = z.object({
  viewMode: z.enum(['unified', 'split', 'inline']),
  showLineNumbers: z.boolean(),
  showWhitespace: z.boolean(),
  contextLines: z.number().min(0).max(100),
  highlightSyntax: z.boolean(),
  wrapLines: z.boolean(),
});

/**
 * TypeScript types inferred from Zod schemas
 */
export type DiffLine = z.infer<typeof DiffLineSchema>;
export type DiffHunk = z.infer<typeof DiffHunkSchema>;
export type FileDiff = z.infer<typeof FileDiffSchema>;
export type DiffSummary = z.infer<typeof DiffSummarySchema>;
export type InlineDiff = z.infer<typeof InlineDiffSchema>;
export type DiffConflict = z.infer<typeof DiffConflictSchema>;
export type DiffViewPreferences = z.infer<typeof DiffViewPreferencesSchema>;

/**
 * Helper functions
 */
export function createDiffLine(
  type: DiffLineType,
  content: string,
  oldLineNumber?: number,
  newLineNumber?: number
): DiffLine {
  return {
    type,
    content,
    oldLineNumber,
    newLineNumber,
  };
}

export function parseDiffHeader(header: string): {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
} | null {
  // Parse headers like "@@ -1,4 +1,5 @@"
  const match = /@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(header);
  if (!match?.[1] || !match[3]) return null;

  return {
    oldStart: parseInt(match[1], 10),
    oldLines: match[2] ? parseInt(match[2], 10) : 1,
    newStart: parseInt(match[3], 10),
    newLines: match[4] ? parseInt(match[4], 10) : 1,
  };
}

export function formatDiffHeader(hunk: DiffHunk): string {
  return `@@ -${String(hunk.oldStart)},${String(hunk.oldLines)} +${String(hunk.newStart)},${String(hunk.newLines)} @@`;
}

export function getDiffLineClass(type: DiffLineType): string {
  switch (type) {
    case DiffLineType.ADDED:
      return 'diff-line-added';
    case DiffLineType.REMOVED:
      return 'diff-line-removed';
    case DiffLineType.CONTEXT:
      return 'diff-line-context';
    case DiffLineType.HEADER:
      return 'diff-line-header';
    case DiffLineType.HUNK_HEADER:
      return 'diff-line-hunk-header';
    default:
      return '';
  }
}

export function getDiffLinePrefix(type: DiffLineType): string {
  switch (type) {
    case DiffLineType.ADDED:
      return '+';
    case DiffLineType.REMOVED:
      return '-';
    case DiffLineType.CONTEXT:
      return ' ';
    case DiffLineType.HEADER:
    case DiffLineType.HUNK_HEADER:
      return '';
    default:
      return '';
  }
}

export function calculateDiffStats(diff: FileDiff): {
  additions: number;
  deletions: number;
  changes: number;
} {
  let additions = 0;
  let deletions = 0;

  for (const hunk of diff.hunks) {
    for (const line of hunk.lines) {
      if (line.type === DiffLineType.ADDED) {
        additions++;
      } else if (line.type === DiffLineType.REMOVED) {
        deletions++;
      }
    }
  }

  return {
    additions,
    deletions,
    changes: additions + deletions,
  };
}

export function createDiffSummary(diffs: FileDiff[]): DiffSummary {
  let totalAdditions = 0;
  let totalDeletions = 0;

  const files = diffs.map((diff) => {
    totalAdditions += diff.additions;
    totalDeletions += diff.deletions;

    return {
      path: diff.newPath,
      additions: diff.additions,
      deletions: diff.deletions,
      changeType: diff.changeType,
    };
  });

  return {
    totalFiles: diffs.length,
    additions: totalAdditions,
    deletions: totalDeletions,
    filesChanged: diffs.length,
    files,
  };
}

export function formatDiffStats(additions: number, deletions: number): string {
  const total = additions + deletions;
  if (total === 0) return '';

  const addedStr = additions > 0 ? `+${String(additions)}` : '';
  const deletedStr = deletions > 0 ? `-${String(deletions)}` : '';

  return [addedStr, deletedStr].filter(Boolean).join(', ');
}

export function expandDiffContext(
  lines: DiffLine[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _contextLines: number
): DiffLine[] {
  // This would expand the context around changes
  // Implementation depends on having access to the full file content
  return lines;
}

export function collapseDiffHunks(hunks: DiffHunk[], minGapSize = 3): DiffHunk[] {
  // Collapse hunks that are close together
  if (hunks.length <= 1) return hunks;

  const collapsed: DiffHunk[] = [];
  const firstHunk = hunks[0];
  if (!firstHunk) return hunks;

  let current: DiffHunk = firstHunk;

  for (let i = 1; i < hunks.length; i++) {
    const next = hunks[i];
    if (!next) continue;

    const gap = next.oldStart - (current.oldStart + current.oldLines);

    if (gap <= minGapSize) {
      // Merge hunks - create gap context lines
      const gapLines: DiffLine[] = Array.from({ length: gap }, (_, j) =>
        createDiffLine(
          DiffLineType.CONTEXT,
          '',
          current.oldStart + current.oldLines + j,
          current.newStart + current.newLines + j
        )
      );

      const combinedLines: DiffLine[] = [...current.lines, ...gapLines, ...next.lines];

      const newOldLines = next.oldStart + next.oldLines - current.oldStart;
      const newNewLines = next.newStart + next.newLines - current.newStart;

      current = {
        oldStart: current.oldStart,
        oldLines: newOldLines,
        newStart: current.newStart,
        newLines: newNewLines,
        header: formatDiffHeader({
          oldStart: current.oldStart,
          oldLines: newOldLines,
          newStart: current.newStart,
          newLines: newNewLines,
          header: '',
          lines: [],
        }),
        lines: combinedLines,
      };
    } else {
      collapsed.push(current);
      current = next;
    }
  }

  collapsed.push(current);
  return collapsed;
}

export function extractDiffConflicts(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _diff: FileDiff
): DiffConflict[] {
  const conflicts: DiffConflict[] = [];

  // This would parse conflict markers like <<<<<<< HEAD, =======, >>>>>>> branch
  // and extract conflict regions
  // Implementation depends on specific conflict marker format

  return conflicts;
}

export function applyDiff(originalContent: string, diff: FileDiff): string {
  const lines = originalContent.split('\n');
  const result: string[] = [];
  let originalIndex = 0;

  for (const hunk of diff.hunks) {
    // Add lines before the hunk
    while (originalIndex < hunk.oldStart - 1) {
      const line = lines[originalIndex];
      if (line !== undefined) {
        result.push(line);
      }
      originalIndex++;
    }

    // Apply hunk changes
    for (const line of hunk.lines) {
      if (line.type === DiffLineType.CONTEXT) {
        result.push(line.content);
        originalIndex++;
      } else if (line.type === DiffLineType.ADDED) {
        result.push(line.content);
      } else if (line.type === DiffLineType.REMOVED) {
        originalIndex++;
      }
    }
  }

  // Add remaining lines
  while (originalIndex < lines.length) {
    const line = lines[originalIndex];
    if (line !== undefined) {
      result.push(line);
    }
    originalIndex++;
  }

  return result.join('\n');
}
