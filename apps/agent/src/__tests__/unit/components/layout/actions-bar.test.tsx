import { render, screen, within } from '@testing-library/react';

import type { GitStatus, StatusEntry } from '@/lib/api';
import type { ReactNode } from 'react';

import { ActionsBar } from '@/components/layout/actions-bar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useGitStore } from '@/stores/git/git-store';
import { useUIStore } from '@/stores/ui/ui-store';

function renderActionsBar(): void {
  render(<ActionsBar />, {
    wrapper: ({ children }: { readonly children: ReactNode }) => (
      <TooltipProvider>{children}</TooltipProvider>
    ),
  });
}

function statusEntry(path: string, status: StatusEntry['status']): StatusEntry {
  return {
    path,
    status,
    oldPath: null,
    similarity: null,
  };
}

function gitStatus(overrides: Partial<GitStatus> = {}): GitStatus {
  return {
    branch: 'main',
    upstream: 'origin/main',
    ahead: 0,
    behind: 0,
    staged: [],
    modified: [],
    untracked: [],
    conflicted: [],
    ...overrides,
  };
}

describe('ActionsBar', () => {
  beforeEach(() => {
    useUIStore.setState(useUIStore.getInitialState(), true);
    useGitStore.setState(useGitStore.getInitialState(), true);
  });

  it('shows and announces the Source Control change count', () => {
    useGitStore.getState().setStatus(
      gitStatus({
        staged: [statusEntry('src/committed.ts', 'modified')],
        modified: [statusEntry('src/working.ts', 'modified')],
        untracked: [statusEntry('src/new.ts', 'untracked')],
      })
    );

    renderActionsBar();

    const sourceControlButton = screen.getByRole('tab', {
      name: 'Source Control, 3 changes',
    });

    expect(within(sourceControlButton).getByText('3')).toBeInTheDocument();
  });
});
