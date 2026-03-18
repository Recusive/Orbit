const { mockWarn } = vi.hoisted(() => ({
  mockWarn: vi.fn(),
}));

vi.mock('@orbit/common/lib', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: mockWarn,
  }),
}));

import { buildChangelogEntries, createVirtualEntry } from '@/lib/changelog-loader';

describe('changelog-loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses valid frontmatter and ignores extra fields', () => {
    const entries = buildChangelogEntries({
      '/src/changelogs/v0.0.2.md': `---
title: Orbit v0.0.2
date: 2026-03-10
summary: ignored
---

## What's New
- Shipped changelogs
`,
    });

    expect(entries).toEqual([
      {
        version: '0.0.2',
        title: 'Orbit v0.0.2',
        date: '2026-03-10',
        body: "## What's New\n- Shipped changelogs",
      },
    ]);
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it('skips changelogs missing required title or date fields', () => {
    const entries = buildChangelogEntries({
      '/src/changelogs/v0.0.1.md': `---
date: 2026-03-01
---
Missing title
`,
      '/src/changelogs/v0.0.2.md': `---
title: Orbit v0.0.2
---
Missing date
`,
      '/src/changelogs/v0.0.3.md': `---
summary: no required fields
---
Missing both
`,
    });

    expect(entries).toEqual([]);
    expect(mockWarn).toHaveBeenCalledTimes(3);
  });

  it('keeps horizontal rules in the markdown body', () => {
    const entries = buildChangelogEntries({
      '/src/changelogs/v0.0.2.md': `---
title: Orbit v0.0.2
date: 2026-03-10
---

Paragraph
---
Tail
`,
    });

    expect(entries[0]?.body).toBe('Paragraph\n---\nTail');
  });

  it('normalizes BOM and CRLF line endings before parsing', () => {
    const entries = buildChangelogEntries({
      '/src/changelogs/v0.0.2.md':
        '\uFEFF---\r\ntitle: Orbit v0.0.2\r\ndate: 2026-03-10\r\n---\r\nLine one\r\nLine two\r\n',
    });

    expect(entries).toEqual([
      {
        version: '0.0.2',
        title: 'Orbit v0.0.2',
        date: '2026-03-10',
        body: 'Line one\nLine two',
      },
    ]);
  });

  it('sorts versions in descending semver order, including pre-releases', () => {
    const entries = buildChangelogEntries({
      '/src/changelogs/v0.0.4.md': `---
title: Orbit v0.0.4
date: 2026-03-08
---
Stable four
`,
      '/src/changelogs/v0.0.5-beta.1.md': `---
title: Orbit v0.0.5 Beta 1
date: 2026-03-09
---
Beta one
`,
      '/src/changelogs/v0.0.5.md': `---
title: Orbit v0.0.5
date: 2026-03-10
---
Stable five
`,
      '/src/changelogs/v0.0.5-beta.2.md': `---
title: Orbit v0.0.5 Beta 2
date: 2026-03-09
---
Beta two
`,
    });

    expect(entries.map((entry) => entry.version)).toEqual([
      '0.0.5',
      '0.0.5-beta.2',
      '0.0.5-beta.1',
      '0.0.4',
    ]);
  });

  it('warns and keeps the first duplicate version entry', () => {
    const entries = buildChangelogEntries([
      [
        '/src/changelogs/v0.0.2.md',
        `---
title: First entry
date: 2026-03-10
---
First body
`,
      ],
      [
        '/src/changelogs/v0.0.2.md',
        `---
title: Duplicate entry
date: 2026-03-11
---
Second body
`,
      ],
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.title).toBe('First entry');
    expect(mockWarn).toHaveBeenCalledWith('Skipping duplicate changelog version', {
      path: '/src/changelogs/v0.0.2.md',
      version: '0.0.2',
    });
  });

  it('skips invalid filenames', () => {
    const entries = buildChangelogEntries({
      '/src/changelogs/changelog.md': `---
title: Invalid
date: 2026-03-10
---
Ignored
`,
    });

    expect(entries).toEqual([]);
    expect(mockWarn).toHaveBeenCalledWith('Skipping changelog with invalid filename', {
      path: '/src/changelogs/changelog.md',
    });
  });

  it('returns an empty list when no changelog files are provided', () => {
    expect(buildChangelogEntries({})).toEqual([]);
  });

  it('creates a virtual entry from remote release notes', () => {
    expect(createVirtualEntry('0.0.6', '## Remote\n- Added updates')).toEqual({
      version: '0.0.6',
      title: 'Orbit v0.0.6',
      date: 'Available now',
      body: '## Remote\n- Added updates',
    });
  });

  it('uses fallback body text when remote release notes are null or blank', () => {
    expect(createVirtualEntry('0.0.6', null).body).toBe('Update to Orbit v0.0.6.');
    expect(createVirtualEntry('0.0.6', '   ').body).toBe('Update to Orbit v0.0.6.');
  });
});
