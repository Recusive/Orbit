import type { DiffScope } from '@/lib/api';
import type { FileDiffMetadata } from '@pierre/diffs/react';

export interface CachedParsedDiff {
  fileDiff: FileDiffMetadata;
  additions: number;
  deletions: number;
  oldContent: string;
  newContent: string;
}

interface ParsedDiffCacheIdentity {
  repoPath: string;
  scope: DiffScope;
  path: string;
  oldPath: string | null;
  statusFingerprint: string | null;
}

export const MAX_PARSED_DIFF_CACHE_ENTRIES = 20;

const parsedDiffCache = new Map<string, CachedParsedDiff>();

export function getParsedDiffCacheKey({
  repoPath,
  scope,
  path,
  oldPath,
  statusFingerprint,
}: ParsedDiffCacheIdentity): string {
  return [repoPath, scope, path, oldPath ?? '', statusFingerprint ?? 'unknown'].join('::');
}

export function getCachedParsedDiff(key: string): CachedParsedDiff | undefined {
  const cached = parsedDiffCache.get(key);
  if (!cached) {
    return undefined;
  }

  parsedDiffCache.delete(key);
  parsedDiffCache.set(key, cached);
  return cached;
}

export function setCachedParsedDiff(key: string, value: CachedParsedDiff): void {
  if (parsedDiffCache.has(key)) {
    parsedDiffCache.delete(key);
  }

  parsedDiffCache.set(key, value);

  if (parsedDiffCache.size <= MAX_PARSED_DIFF_CACHE_ENTRIES) {
    return;
  }

  const oldestKey = parsedDiffCache.keys().next().value;
  if (typeof oldestKey === 'string') {
    parsedDiffCache.delete(oldestKey);
  }
}

export function clearParsedDiffCache(): void {
  parsedDiffCache.clear();
}

export function getParsedDiffCacheSize(): number {
  return parsedDiffCache.size;
}
