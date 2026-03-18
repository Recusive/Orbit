import { getChangelogs, getMergedChangelogs, mergeChangelogEntries } from '@/lib/changelog-loader';

function createEntry(
  version: string,
  title = `Orbit v${version}`
): {
  readonly version: string;
  readonly title: string;
  readonly date: string;
  readonly body: string;
} {
  return {
    version,
    title,
    date: '2026-03-10',
    body: `## ${title}`,
  };
}

describe('changelog-loader getMergedChangelogs', () => {
  it('prepends a virtual entry when the available version is newer than bundled', () => {
    const bundledEntries = [createEntry('0.0.2'), createEntry('0.0.1')];
    const mergedEntries = mergeChangelogEntries(
      bundledEntries,
      '999.0.0',
      '## Remote\n- Incoming release'
    );

    expect(mergedEntries[0]).toEqual(
      expect.objectContaining({
        version: '999.0.0',
        date: 'Available now',
        body: '## Remote\n- Incoming release',
      })
    );
    expect(mergedEntries.slice(1)).toEqual(bundledEntries);
  });

  it('keeps the bundled entry when the available version matches the newest bundled version', () => {
    const bundledEntries = [createEntry('0.0.2', 'Bundled entry'), createEntry('0.0.1')];
    const newestBundled = bundledEntries[0];

    const mergedEntries = mergeChangelogEntries(
      bundledEntries,
      newestBundled?.version ?? null,
      'Remote fallback that should not replace bundled content'
    );

    expect(mergedEntries).toBe(bundledEntries);
    expect(mergedEntries[0]).toBe(newestBundled);
    expect(mergedEntries[0]?.body).not.toBe(
      'Remote fallback that should not replace bundled content'
    );
  });

  it('skips the virtual entry when the available version is older than the newest bundled version', () => {
    const bundledEntries = [createEntry('0.0.2'), createEntry('0.0.1')];
    const mergedEntries = mergeChangelogEntries(bundledEntries, '0.0.0', 'Rollback notes');

    expect(mergedEntries).toBe(bundledEntries);
    expect(mergedEntries.some((entry) => entry.version === '0.0.0')).toBe(false);
  });

  it('returns bundled changelogs when there is no available update version', () => {
    const bundledEntries = [createEntry('0.0.2'), createEntry('0.0.1')];

    expect(mergeChangelogEntries(bundledEntries, null, 'ignored')).toBe(bundledEntries);
  });

  it('returns the bundled changelog cache from getMergedChangelogs when there is no available update version', () => {
    const bundledEntries = getChangelogs();

    expect(getMergedChangelogs(null, 'ignored')).toBe(bundledEntries);
  });
});
