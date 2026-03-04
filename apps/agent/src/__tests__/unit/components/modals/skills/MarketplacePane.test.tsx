import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { MarketplaceInstallResult, MarketplaceSkill } from '@/lib/api/marketplace';

const {
  coreState,
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

describe('MarketplacePane', () => {
  const sampleSkill: MarketplaceSkill = {
    id: 'owner/repo/react-skill',
    skillId: 'react-skill',
    name: 'react-skill',
    installs: 12345,
    source: 'owner/repo',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    coreState.isTauri = true;
    mockGetWorkspacePath.mockResolvedValue('/workspace');
    mockGetInstalledMarketplaceIds.mockResolvedValue([]);
    mockSearchMarketplaceSkills.mockResolvedValue([sampleSkill]);
    mockInstallMarketplaceSkill.mockResolvedValue({
      success: true,
      installedId: sampleSkill.id,
    });
  });

  it('shows desktop-only guard when not running in Tauri', () => {
    coreState.isTauri = false;

    render(<MarketplacePane active search="" onInstalled={mockOnInstalled} />);

    expect(screen.getByText('Marketplace requires the desktop app')).toBeInTheDocument();
  });

  it('shows installed badge for already-installed marketplace skills', async () => {
    mockGetInstalledMarketplaceIds.mockResolvedValue([sampleSkill.id]);

    render(<MarketplacePane active search="" onInstalled={mockOnInstalled} />);

    await waitFor(() => {
      expect(screen.getByText('react-skill')).toBeInTheDocument();
    });
    expect(screen.getByText('Installed')).toBeInTheDocument();
  });

  it('installs skill and surfaces warning toasts', async () => {
    mockInstallMarketplaceSkill.mockResolvedValue({
      success: true,
      installedId: sampleSkill.id,
      warnings: ['Manifest update failed'],
    });
    const user = userEvent.setup();

    render(<MarketplacePane active search="" onInstalled={mockOnInstalled} />);

    await waitFor(() => {
      expect(screen.getByText('react-skill')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.click(screen.getByRole('button', { name: /Personal/i }));

    await waitFor(() => {
      expect(mockInstallMarketplaceSkill).toHaveBeenCalledWith(
        sampleSkill.source,
        sampleSkill.skillId,
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
