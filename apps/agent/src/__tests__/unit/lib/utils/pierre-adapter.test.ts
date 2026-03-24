import {
  getGitFileContentsCacheKey,
  getPierreChangedLineCount,
  getPierreDiffRenderTier,
  LARGE_DIFF_INLINE_THRESHOLD,
  PATHOLOGICAL_DIFF_THRESHOLD,
} from '@/lib/utils/pierre-adapter';

describe('pierre-adapter', () => {
  it('builds stable cache keys that include oldPath for rename identities', () => {
    const renamed = getGitFileContentsCacheKey({
      repoPath: '/repo',
      scope: 'unstaged',
      path: 'src/new-name.ts',
      oldPath: 'src/old-name.ts',
      side: 'old',
      contents: 'const value = 1;',
    });
    const nonRenamed = getGitFileContentsCacheKey({
      repoPath: '/repo',
      scope: 'unstaged',
      path: 'src/new-name.ts',
      oldPath: null,
      side: 'old',
      contents: 'const value = 1;',
    });

    expect(renamed).not.toBe(nonRenamed);
  });

  it('changes cache keys when the content changes', () => {
    const first = getGitFileContentsCacheKey({
      repoPath: '/repo',
      scope: 'staged',
      path: 'src/app.ts',
      oldPath: null,
      side: 'new',
      contents: 'const value = 1;',
    });
    const second = getGitFileContentsCacheKey({
      repoPath: '/repo',
      scope: 'staged',
      path: 'src/app.ts',
      oldPath: null,
      side: 'new',
      contents: 'const value = 2;',
    });

    expect(first).not.toBe(second);
  });

  it('classifies diff tiers at the configured thresholds', () => {
    expect(getPierreDiffRenderTier(getPierreChangedLineCount(10, 10))).toBe('small');
    expect(getPierreDiffRenderTier(LARGE_DIFF_INLINE_THRESHOLD)).toBe('large');
    expect(getPierreDiffRenderTier(PATHOLOGICAL_DIFF_THRESHOLD)).toBe('pathological');
  });
});
