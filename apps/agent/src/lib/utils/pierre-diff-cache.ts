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

export const MAX_PARSED_DIFF_CACHE_ENTRIES = 80;
export const MAX_PARSED_DIFF_CACHE_BYTES = 50_000_000;

const parsedDiffCache = new Map<string, CachedParsedDiff>();
let totalCachedBytes = 0;

function getCachedEntryBytes(value: CachedParsedDiff): number {
  return value.oldContent.length + value.newContent.length;
}

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
  const entryBytes = getCachedEntryBytes(value);
  if (entryBytes > MAX_PARSED_DIFF_CACHE_BYTES) {
    parsedDiffCache.delete(key);
    return;
  }

  const previous = parsedDiffCache.get(key);
  if (previous) {
    totalCachedBytes -= getCachedEntryBytes(previous);
    parsedDiffCache.delete(key);
  }

  while (totalCachedBytes + entryBytes > MAX_PARSED_DIFF_CACHE_BYTES && parsedDiffCache.size > 0) {
    const oldestKey = parsedDiffCache.keys().next().value;
    if (typeof oldestKey !== 'string') {
      break;
    }

    const oldest = parsedDiffCache.get(oldestKey);
    if (oldest) {
      totalCachedBytes -= getCachedEntryBytes(oldest);
    }
    parsedDiffCache.delete(oldestKey);
  }

  parsedDiffCache.set(key, value);
  totalCachedBytes += entryBytes;

  if (parsedDiffCache.size <= MAX_PARSED_DIFF_CACHE_ENTRIES) {
    return;
  }

  const oldestKey = parsedDiffCache.keys().next().value;
  if (typeof oldestKey === 'string') {
    const oldest = parsedDiffCache.get(oldestKey);
    if (oldest) {
      totalCachedBytes -= getCachedEntryBytes(oldest);
    }
    parsedDiffCache.delete(oldestKey);
  }
}

export function clearParsedDiffCache(): void {
  parsedDiffCache.clear();
  totalCachedBytes = 0;
}

export function getParsedDiffCacheSize(): number {
  return parsedDiffCache.size;
}
