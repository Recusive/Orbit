import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { MarketplaceInstallResult, MarketplaceSkill } from '@/lib/api/marketplace';

const {
  coreState,
  mockBrowseMarketplaceSkills,
  mockGetInstalledMarketplaceIds,
  mockGetWorkspacePath,
  mockInstallMarketplaceSkill,
  mockOnInstalled,
  mockSearchMarketplaceSkills,
  toastMock,
} = vi.hoisted(() => ({
  coreState: { isTauri: true },
  mockGetWorkspacePath: vi.fn<[], Promise<string | null>>(),
  mockGetInstalledMarketplaceIds: vi.fn<[string?], Promise<string[]>>(),
  mockSearchMarketplaceSkills: vi.fn<[string, number?], Promise<MarketplaceSkill[]>>(),
  mockBrowseMarketplaceSkills: vi.fn<[category: 'trending' | 'top'], Promise<MarketplaceSkill[]>>(),
  mockInstallMarketplaceSkill: vi.fn<
    [string, string, 'project' | 'personal', string?],
    Promise<MarketplaceInstallResult>
  >(),
  mockOnInstalled: vi.fn<[], undefined>(),
  toastMock: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('@/lib/api', () => ({
  browseMarketplaceSkills: mockBrowseMarketplaceSkills,
  getWorkspacePath: mockGetWorkspacePath,
  getInstalledMarketplaceIds: mockGetInstalledMarketplaceIds,
  searchMarketplaceSkills: mockSearchMarketplaceSkills,
  installMarketplaceSkill: mockInstallMarketplaceSkill,
}));

vi.mock('@/lib/api/core', () => ({
  get IS_TAURI() {
    return coreState.isTauri;
  },
}));

vi.mock('@/hooks/ui', () => ({
  useSmoothScroll: () => ({ current: null }),
}));

vi.mock('sonner', () => ({
  toast: toastMock,
}));

import { MarketplacePane } from '@/components/modals/skills/MarketplacePane';

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('MarketplacePane', () => {
  const trendingSkill: MarketplaceSkill = {
    id: 'owner/repo/react-skill',
    skillId: 'react-skill',
    name: 'react-skill',
    installs: 12345,
    source: 'owner/repo',
  };
  const topSkill: MarketplaceSkill = {
    id: 'owner/repo/top-skill',
    skillId: 'top-skill',
    name: 'top-skill',
    installs: 54321,
    source: 'owner/repo',
  };
  const searchSkill: MarketplaceSkill = {
    id: 'owner/repo/search-skill',
    skillId: 'search-skill',
    name: 'search-skill',
    installs: 777,
    source: 'owner/repo',
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useRealTimers();

    coreState.isTauri = true;
    mockGetWorkspacePath.mockResolvedValue('/workspace');
    mockGetInstalledMarketplaceIds.mockResolvedValue([]);
    mockBrowseMarketplaceSkills.mockImplementation((category: 'trending' | 'top') =>
      Promise.resolve(category === 'trending' ? [trendingSkill] : [topSkill])
    );
    mockSearchMarketplaceSkills.mockResolvedValue([searchSkill]);
    mockInstallMarketplaceSkill.mockResolvedValue({
      success: true,
      installedId: trendingSkill.id,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows desktop-only guard when not running in Tauri', () => {
    coreState.isTauri = false;

    render(
      <MarketplacePane
        active
        search=""
        browseCategory="trending"
        onCategoryChange={vi.fn()}
        onInstalled={mockOnInstalled}
      />
    );

    expect(screen.getByText('Marketplace requires the desktop app')).toBeInTheDocument();
  });

  it('shows pill toggle with Trending selected by default when search is empty', async () => {
    render(
      <MarketplacePane
        active
        search=""
        browseCategory="trending"
        onCategoryChange={vi.fn()}
        onInstalled={mockOnInstalled}
      />
    );

    await waitFor(() => {
      expect(mockBrowseMarketplaceSkills).toHaveBeenCalledWith('trending');
    });

    expect(screen.getByRole('button', { name: 'Trending' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Top' })).toBeInTheDocument();
    expect(screen.getByText('react-skill')).toBeInTheDocument();
  });

  it('hides pill toggle when search has content', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    render(
      <MarketplacePane
        active
        search="react"
        browseCategory="trending"
        onCategoryChange={vi.fn()}
        onInstalled={mockOnInstalled}
      />
    );
    await waitFor(() => {
      expect(mockBrowseMarketplaceSkills).toHaveBeenCalledWith('trending');
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    await waitFor(() => {
      expect(mockSearchMarketplaceSkills).toHaveBeenCalledWith('react', 50);
    });
    expect(screen.queryByRole('button', { name: 'Trending' })).not.toBeInTheDocument();
    expect(screen.getByText('search-skill')).toBeInTheDocument();
  });

  it('switches to Top category and renders cached data instantly when switching back', async () => {
    const user = userEvent.setup();

    render(
      <MarketplacePane
        active
        search=""
        browseCategory="trending"
        onCategoryChange={vi.fn()}
        onInstalled={mockOnInstalled}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('react-skill')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Top' }));
    await waitFor(() => {
      expect(mockBrowseMarketplaceSkills).toHaveBeenCalledWith('top');
    });
    expect(screen.getByText('top-skill')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Trending' }));
    await waitFor(() => {
      expect(screen.getByText('react-skill')).toBeInTheDocument();
    });
    expect(mockBrowseMarketplaceSkills).toHaveBeenCalledTimes(2);
  });

  it('restores browse category after clearing search and ignores stale search response', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const searchDeferred = createDeferred<MarketplaceSkill[]>();
    mockSearchMarketplaceSkills.mockImplementationOnce(async () => searchDeferred.promise);

    const { rerender } = render(
      <MarketplacePane
        active
        search=""
        browseCategory="trending"
        onCategoryChange={vi.fn()}
        onInstalled={mockOnInstalled}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('react-skill')).toBeInTheDocument();
    });

    rerender(
      <MarketplacePane
        active
        search="slow-query"
        browseCategory="trending"
        onCategoryChange={vi.fn()}
        onInstalled={mockOnInstalled}
      />
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    await waitFor(() => {
      expect(mockSearchMarketplaceSkills).toHaveBeenCalledWith('slow-query', 50);
    });

    rerender(
      <MarketplacePane
        active
        search=""
        browseCategory="trending"
        onCategoryChange={vi.fn()}
        onInstalled={mockOnInstalled}
      />
    );
    await waitFor(() => {
      expect(screen.getByText('react-skill')).toBeInTheDocument();
    });

    await act(async () => {
      searchDeferred.resolve([searchSkill]);
      await Promise.resolve();
    });

    expect(screen.getByText('react-skill')).toBeInTheDocument();
    expect(screen.queryByText('search-skill')).not.toBeInTheDocument();
  });

  it('calls loadBrowse on retry when not searching', async () => {
    const user = userEvent.setup();
    mockBrowseMarketplaceSkills
      .mockRejectedValueOnce(new Error('browse failed'))
      .mockResolvedValueOnce([trendingSkill]);

    render(
      <MarketplacePane
        active
        search=""
        browseCategory="trending"
        onCategoryChange={vi.fn()}
        onInstalled={mockOnInstalled}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('browse failed')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(screen.getByText('react-skill')).toBeInTheDocument();
    });

    expect(mockBrowseMarketplaceSkills).toHaveBeenCalledTimes(2);
    expect(mockSearchMarketplaceSkills).not.toHaveBeenCalled();
  });

  it('calls runSearch on retry when searching', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockSearchMarketplaceSkills
      .mockRejectedValueOnce(new Error('search failed'))
      .mockResolvedValueOnce([searchSkill]);

    render(
      <MarketplacePane
        active
        search="react"
        browseCategory="trending"
        onCategoryChange={vi.fn()}
        onInstalled={mockOnInstalled}
      />
    );
    await waitFor(() => {
      expect(mockBrowseMarketplaceSkills).toHaveBeenCalledWith('trending');
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    await waitFor(() => {
      expect(screen.getByText('search failed')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(screen.getByText('search-skill')).toBeInTheDocument();
    });

    expect(mockSearchMarketplaceSkills).toHaveBeenNthCalledWith(1, 'react', 50);
    expect(mockSearchMarketplaceSkills).toHaveBeenNthCalledWith(2, 'react', 50);
  });

  it('shows category-aware empty state for browse mode', async () => {
    const user = userEvent.setup();
    mockBrowseMarketplaceSkills.mockResolvedValue([]);

    render(
      <MarketplacePane
        active
        search=""
        browseCategory="trending"
        onCategoryChange={vi.fn()}
        onInstalled={mockOnInstalled}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Couldn't load trending skills")).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Top' }));
    await waitFor(() => {
      expect(screen.getByText("Couldn't load top skills")).toBeInTheDocument();
    });
  });

  it('treats whitespace-only search as empty and does not issue a search call', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    render(
      <MarketplacePane
        active
        search="   "
        browseCategory="trending"
        onCategoryChange={vi.fn()}
        onInstalled={mockOnInstalled}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Trending' })).toBeInTheDocument();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    expect(mockSearchMarketplaceSkills).not.toHaveBeenCalled();
  });

  it('serves stale cache when browse refetch fails after TTL expiry', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-03-05T12:00:00.000Z'));

    mockBrowseMarketplaceSkills
      .mockResolvedValueOnce([trendingSkill])
      .mockRejectedValueOnce(new Error('network offline'));
    const { rerender } = render(
      <MarketplacePane
        active
        search=""
        browseCategory="trending"
        onCategoryChange={vi.fn()}
        onInstalled={mockOnInstalled}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('react-skill')).toBeInTheDocument();
    });

    vi.setSystemTime(new Date('2026-03-05T12:05:01.000Z'));

    rerender(
      <MarketplacePane
        active
        search="react"
        browseCategory="trending"
        onCategoryChange={vi.fn()}
        onInstalled={mockOnInstalled}
      />
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    await waitFor(() => {
      expect(screen.getByText('search-skill')).toBeInTheDocument();
    });

    rerender(
      <MarketplacePane
        active
        search=""
        browseCategory="trending"
        onCategoryChange={vi.fn()}
        onInstalled={mockOnInstalled}
      />
    );
    await waitFor(() => {
      expect(screen.getByText('react-skill')).toBeInTheDocument();
    });
    expect(screen.queryByText('network offline')).not.toBeInTheDocument();
  });

  it('shows installed badge for already-installed marketplace skills', async () => {
    mockGetInstalledMarketplaceIds.mockResolvedValue([trendingSkill.id]);

    render(
      <MarketplacePane
        active
        search=""
        browseCategory="trending"
        onCategoryChange={vi.fn()}
        onInstalled={mockOnInstalled}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('react-skill')).toBeInTheDocument();
    });
    expect(screen.getByText('Installed')).toBeInTheDocument();
  });

  it('installs skill and surfaces warning toasts', async () => {
    mockInstallMarketplaceSkill.mockResolvedValue({
      success: true,
      installedId: trendingSkill.id,
      warnings: ['Manifest update failed'],
    });
    const user = userEvent.setup();

    render(
      <MarketplacePane
        active
        search=""
        browseCategory="trending"
        onCategoryChange={vi.fn()}
        onInstalled={mockOnInstalled}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('react-skill')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.click(screen.getByRole('button', { name: /Personal/i }));

    await waitFor(() => {
      expect(mockInstallMarketplaceSkill).toHaveBeenCalledWith(
        trendingSkill.source,
        trendingSkill.skillId,
        'personal',
        undefined
      );
    });
    expect(mockOnInstalled).toHaveBeenCalledTimes(1);
    expect(toastMock.warning).toHaveBeenCalledWith('Skill installed with warning', {
      description: 'Manifest update failed',
    });
  });
});
