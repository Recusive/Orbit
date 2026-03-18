import { render, screen } from '@testing-library/react';

import type * as ChangelogLoaderModule from '@/lib/changelog-loader';
import type { ChangelogEntry } from '@/lib/changelog-loader';

const { mockGetMergedChangelogs, mockUpdateState } = vi.hoisted(() => ({
  mockGetMergedChangelogs: vi.fn(),
  mockUpdateState: {
    availableVersion: null as string | null,
    releaseNotes: null as string | null,
  },
}));

vi.mock('@/hooks/agent/use-tauri', () => ({
  useTauri: () => ({
    postMessage: vi.fn(),
    isConnected: true,
    isMockMode: true,
  }),
}));

vi.mock('@/lib/changelog-loader', async () => {
  const actual = await vi.importActual<typeof ChangelogLoaderModule>('@/lib/changelog-loader');

  return {
    ...actual,
    getMergedChangelogs: mockGetMergedChangelogs,
  };
});

vi.mock('@/stores/ui/update-store', () => ({
  useUpdateStore: (selector: (state: typeof mockUpdateState) => unknown) =>
    selector(mockUpdateState),
}));

import {
  ChangelogSettings,
  formatChangelogDate,
} from '@/components/modals/settings/pages/ChangelogSettings';

function createEntry(version: string, title: string, date: string, body: string): ChangelogEntry {
  return { version, title, date, body };
}

function setUpdateState(overrides: Partial<typeof mockUpdateState> = {}): void {
  mockUpdateState.availableVersion = overrides.availableVersion ?? null;
  mockUpdateState.releaseNotes = overrides.releaseNotes ?? null;
}

describe('ChangelogSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setUpdateState();
  });

  it('renders all changelog entries returned by the loader', () => {
    mockGetMergedChangelogs.mockReturnValue([
      createEntry('0.0.2', 'Orbit v0.0.2', '2026-03-10', '## Stable\n- Shipped polish'),
      createEntry('0.0.1', 'Orbit v0.0.1', '2026-02-28', '## First\n- Initial release'),
    ]);

    render(<ChangelogSettings />);

    expect(screen.getByText('Orbit v0.0.2')).toBeInTheDocument();
    expect(screen.getByText('Orbit v0.0.1')).toBeInTheDocument();
  });

  it('renders a prepended virtual entry when the loader returns a newer remote version', () => {
    setUpdateState({
      availableVersion: '0.0.3',
      releaseNotes: '## Remote\n- Incoming release',
    });
    mockGetMergedChangelogs.mockReturnValue([
      createEntry('0.0.3', 'Orbit v0.0.3', 'Available now', '## Remote\n- Incoming release'),
      createEntry('0.0.2', 'Orbit v0.0.2', '2026-03-10', '## Stable\n- Shipped polish'),
    ]);

    render(<ChangelogSettings />);

    expect(screen.getByText('Orbit v0.0.3')).toBeInTheDocument();
    expect(screen.getByText('Incoming release')).toBeInTheDocument();
  });

  it('keeps the bundled entry when the remote version matches an existing release', () => {
    setUpdateState({
      availableVersion: '0.0.2',
      releaseNotes: 'Remote fallback body that should be ignored',
    });
    mockGetMergedChangelogs.mockReturnValue([
      createEntry('0.0.2', 'Orbit v0.0.2', '2026-03-10', '## Stable\n- Shipped polish'),
      createEntry('0.0.1', 'Orbit v0.0.1', '2026-02-28', '## First\n- Initial release'),
    ]);

    render(<ChangelogSettings />);

    expect(screen.getByText('Shipped polish')).toBeInTheDocument();
    expect(
      screen.queryByText('Remote fallback body that should be ignored')
    ).not.toBeInTheDocument();
  });

  it('does not render an older remote entry when the loader skips stale update data', () => {
    setUpdateState({
      availableVersion: '0.0.1',
      releaseNotes: 'Rollback notes that should be ignored',
    });
    mockGetMergedChangelogs.mockReturnValue([
      createEntry('0.0.2', 'Orbit v0.0.2', '2026-03-10', '## Stable\n- Shipped polish'),
    ]);

    render(<ChangelogSettings />);

    expect(screen.queryByText('Rollback notes that should be ignored')).not.toBeInTheDocument();
    expect(screen.queryByText('Available now')).not.toBeInTheDocument();
  });

  it('renders quick-jump links, version badges, and formatted dates', () => {
    mockGetMergedChangelogs.mockReturnValue([
      createEntry('0.0.2', 'Orbit v0.0.2', '2026-03-10', '## Stable\n- Shipped polish'),
      createEntry('0.0.1', 'Orbit v0.0.1', '2026-02-28', '## First\n- Initial release'),
    ]);

    render(<ChangelogSettings />);

    expect(screen.getByRole('link', { name: 'v0.0.2' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'v0.0.1' })).toBeInTheDocument();
    expect(screen.getAllByText('v0.0.2').length).toBeGreaterThan(1);
    expect(screen.getByText('Mar 10, 2026')).toBeInTheDocument();
  });

  it('passes the update store values into getMergedChangelogs', () => {
    setUpdateState({
      availableVersion: '0.0.7',
      releaseNotes: '## Remote\n- Notes',
    });
    mockGetMergedChangelogs.mockReturnValue([]);

    render(<ChangelogSettings />);

    expect(mockGetMergedChangelogs).toHaveBeenCalledWith('0.0.7', '## Remote\n- Notes');
  });

  it('formats ISO dates in local time without a timezone shift', () => {
    expect(formatChangelogDate('2026-03-10')).toBe('Mar 10, 2026');
  });

  it('renders the empty state when no changelogs are available', () => {
    mockGetMergedChangelogs.mockReturnValue([]);

    render(<ChangelogSettings />);

    expect(screen.getByText('No changelogs available')).toBeInTheDocument();
  });
});
