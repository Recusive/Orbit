import { act, render, waitFor } from '@testing-library/react';

import type { FC, ReactNode } from 'react';

import { SkillsDialog } from '@/components/modals/skills/SkillsDialog';
import { useCommandsStore } from '@/stores/agent';

interface CapturedMarketplaceProps {
  readonly active: boolean;
  readonly search: string;
  readonly onInstalled: () => void;
}

let capturedOnInstalled: (() => void) | undefined;

const { mockRefreshSkills } = vi.hoisted(() => ({
  mockRefreshSkills: vi.fn<[], Promise<void>>().mockResolvedValue(undefined),
}));

vi.mock('@/components/modals/skills/MarketplacePane', () => ({
  MarketplacePane: ((props: CapturedMarketplaceProps) => {
    capturedOnInstalled = props.onInstalled;
    return <div data-testid="marketplace-pane" />;
  }) as FC<CapturedMarketplaceProps>,
}));

vi.mock('@/components/modals/skills/InstalledSkillsPane', () => ({
  InstalledSkillsPane: (() => <div data-testid="installed-pane" />) as FC,
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { readonly children: ReactNode }) => <div>{children}</div>,
  DialogContentGlass: ({ children }: { readonly children: ReactNode }) => <div>{children}</div>,
  DialogClose: ({ children }: { readonly children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
  DialogTitle: ({ children }: { readonly children: ReactNode }) => <span>{children}</span>,
  DialogDescription: ({ children }: { readonly children: ReactNode }) => <span>{children}</span>,
}));

describe('SkillsDialog onInstalled wiring', () => {
  let originalRefreshSkills: (() => Promise<void>) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnInstalled = undefined;

    originalRefreshSkills ??= useCommandsStore.getState().refreshSkills;

    useCommandsStore.setState({ refreshSkills: mockRefreshSkills });
  });

  afterEach(() => {
    if (originalRefreshSkills !== null) {
      useCommandsStore.setState({ refreshSkills: originalRefreshSkills });
    }
  });

  it('calls refreshSkills on the commands store when MarketplacePane fires onInstalled', async () => {
    render(<SkillsDialog open onOpenChange={vi.fn()} />);

    expect(capturedOnInstalled).toBeDefined();

    act(() => {
      capturedOnInstalled?.();
    });

    await waitFor(() => {
      expect(mockRefreshSkills).toHaveBeenCalledTimes(1);
    });
  });
});
