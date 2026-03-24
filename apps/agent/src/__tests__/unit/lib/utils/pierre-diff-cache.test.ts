import type { CachedParsedDiff } from '@/lib/utils/pierre-diff-cache';

import {
  clearParsedDiffCache,
  getCachedParsedDiff,
  getParsedDiffCacheKey,
  getParsedDiffCacheSize,
  MAX_PARSED_DIFF_CACHE_ENTRIES,
  setCachedParsedDiff,
} from '@/lib/utils/pierre-diff-cache';

function createEntry(label: string): CachedParsedDiff {
  return {
    fileDiff: {
      type: 'file-diff',
      name: `${label}.ts`,
      lang: 'typescript',
      isPartial: false,
      hunks: [],
      splitLineCount: 0,
      unifiedLineCount: 0,
      deletionLines: [],
      additionLines: [],
      cacheKey: label,
    } as unknown as CachedParsedDiff['fileDiff'],
    additions: 1,
    deletions: 1,
    oldContent: 'old',
    newContent: 'new',
  };
}

describe('pierre-diff-cache', () => {
  beforeEach(() => {
    clearParsedDiffCache();
  });

  it('includes both path and oldPath in parsed cache keys', () => {
    const renamed = getParsedDiffCacheKey({
      repoPath: '/repo',
      scope: 'unstaged',
      path: 'src/new-name.ts',
      oldPath: 'src/old-name.ts',
      statusFingerprint: 'one',
    });
    const nonRenamed = getParsedDiffCacheKey({
      repoPath: '/repo',
      scope: 'unstaged',
      path: 'src/new-name.ts',
      oldPath: null,
      statusFingerprint: 'one',
    });

    expect(renamed).not.toBe(nonRenamed);
  });

  it('misses when the status fingerprint changes', () => {
    const key = getParsedDiffCacheKey({
      repoPath: '/repo',
      scope: 'unstaged',
      path: 'src/app.ts',
      oldPath: null,
      statusFingerprint: 'one',
    });
    const changedKey = getParsedDiffCacheKey({
      repoPath: '/repo',
      scope: 'unstaged',
      path: 'src/app.ts',
      oldPath: null,
      statusFingerprint: 'two',
    });

    setCachedParsedDiff(key, createEntry('first'));

    expect(getCachedParsedDiff(key)).toBeDefined();
    expect(getCachedParsedDiff(changedKey)).toBeUndefined();
  });

  it('evicts the least-recently-used entry when the cache reaches capacity', () => {
    for (let index = 0; index < MAX_PARSED_DIFF_CACHE_ENTRIES; index++) {
      setCachedParsedDiff(`key-${index.toString()}`, createEntry(`entry-${index.toString()}`));
    }

    expect(getParsedDiffCacheSize()).toBe(MAX_PARSED_DIFF_CACHE_ENTRIES);

    getCachedParsedDiff('key-0');
    setCachedParsedDiff('key-overflow', createEntry('overflow'));

    expect(getCachedParsedDiff('key-1')).toBeUndefined();
    expect(getCachedParsedDiff('key-0')).toBeDefined();
  });
});
