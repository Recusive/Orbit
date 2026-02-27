/**
 * Unit tests for BranchSelector.tsx
 *
 * Tests:
 * - browse/create mode rendering and transitions
 * - manual branch filtering
 * - checkout/create interactions
 * - keyboard close/cancel behavior
 * - focus management and state reset
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { GitBranch, GitStatus } from '@/lib/api';
import type { ComponentProps } from 'react';

import { BranchSelector } from '@/components/git/source-control/components/BranchSelector';

const defaultStatus: GitStatus = {
  branch: 'main',
  upstream: 'origin/main',
  ahead: 0,
  behind: 0,
  staged: [],
  modified: [],
  untracked: [],
  conflicted: [],
};

const defaultBranches: GitBranch[] = [
  { name: 'main', isCurrent: true, isRemote: false, upstream: 'origin/main' },
  { name: 'feature/refactor', isCurrent: false, isRemote: false },
  { name: 'fix/prod', isCurrent: false, isRemote: false },
  { name: 'origin/main', isCurrent: false, isRemote: true },
];

function getCommandItemByText(text: string): HTMLElement {
  const matches = screen.getAllByText(text);
  const item = matches.find((node) => node.closest('[cmdk-item]') !== null);
  if (!item) {
    throw new Error(`Could not find command item with text: ${text}`);
  }

  const commandItem = item.closest('[cmdk-item]');
  if (!(commandItem instanceof HTMLElement)) {
    throw new Error(`Could not find cmdk wrapper for text: ${text}`);
  }
  return commandItem;
}

function renderSelector(overrides: Partial<ComponentProps<typeof BranchSelector>> = {}): {
  user: ReturnType<typeof userEvent.setup>;
  onCheckout: ReturnType<typeof vi.fn>;
  onCreateAndCheckout: ReturnType<typeof vi.fn>;
} {
  const onCheckout = vi.fn();
  const onCreateAndCheckout = vi.fn<[string], Promise<void>>().mockResolvedValue(undefined);
  const user = userEvent.setup();

  render(
    <BranchSelector
      status={defaultStatus}
      branches={defaultBranches}
      isCheckingOut={false}
      onCheckout={onCheckout}
      onCreateAndCheckout={onCreateAndCheckout}
      {...overrides}
    />
  );

  return { user, onCheckout, onCreateAndCheckout };
}

async function openSelector(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: /main/i }));
  await waitFor(() => {
    expect(screen.getByLabelText('Search branches')).toBeInTheDocument();
  });
}

describe('BranchSelector', () => {
  it('renders browse mode with search input, local branches, and create action', async () => {
    const { user } = renderSelector();
    await openSelector(user);

    expect(screen.getByLabelText('Search branches')).toBeInTheDocument();
    expect(getCommandItemByText('main')).toBeInTheDocument();
    expect(screen.getByText('feature/refactor')).toBeInTheDocument();
    expect(screen.getByText('fix/prod')).toBeInTheDocument();
    expect(screen.queryByText('origin/main')).not.toBeInTheDocument();
    expect(screen.getByText('Create and checkout new branch...')).toBeInTheDocument();
  });

  it('filters branches from the search query using manual filtering', async () => {
    const { user } = renderSelector();
    await openSelector(user);

    await user.type(screen.getByLabelText('Search branches'), 'fix');

    expect(screen.getByText('fix/prod')).toBeInTheDocument();
    expect(screen.queryByText('feature/refactor')).not.toBeInTheDocument();
    expect(screen.getByText('Create and checkout new branch...')).toBeInTheDocument();
  });

  it('calls onCheckout and closes after selecting a non-current branch', async () => {
    const { user, onCheckout } = renderSelector();
    await openSelector(user);

    await user.click(getCommandItemByText('feature/refactor'));

    expect(onCheckout).toHaveBeenCalledWith('feature/refactor');
    await waitFor(() => {
      expect(screen.queryByLabelText('Search branches')).not.toBeInTheDocument();
    });
  });

  it('does not call onCheckout for the current branch', async () => {
    const { user, onCheckout } = renderSelector();
    await openSelector(user);

    await user.click(getCommandItemByText('main'));

    expect(onCheckout).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Search branches')).toBeInTheDocument();
  });

  it('enters create mode and pre-fills the branch name from search query', async () => {
    const { user } = renderSelector();
    await openSelector(user);

    await user.type(screen.getByLabelText('Search branches'), 'feature/new');
    await user.click(getCommandItemByText('Create and checkout new branch...'));

    expect(screen.queryByLabelText('Search branches')).not.toBeInTheDocument();
    expect(screen.getByLabelText('New branch name')).toHaveValue('feature/new');
  });

  it('returns to browse mode on Escape in create mode without closing the popover', async () => {
    const { user } = renderSelector();
    await openSelector(user);
    await user.click(getCommandItemByText('Create and checkout new branch...'));

    await user.keyboard('{Escape}');

    expect(screen.queryByLabelText('New branch name')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Search branches')).toBeInTheDocument();
  });

  it('closes the popover on Escape in browse mode', async () => {
    const { user } = renderSelector();
    await openSelector(user);

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByLabelText('Search branches')).not.toBeInTheDocument();
    });
  });

  it('resets mode and search state after closing and reopening', async () => {
    const { user } = renderSelector();
    await openSelector(user);

    await user.type(screen.getByLabelText('Search branches'), 'temp-query');
    await user.click(getCommandItemByText('Create and checkout new branch...'));

    await user.click(screen.getByRole('button', { name: /main/i }));
    await waitFor(() => {
      expect(screen.queryByLabelText('New branch name')).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /main/i }));
    const searchInput = screen.getByLabelText('Search branches');

    expect(searchInput).toHaveValue('');
    expect(screen.queryByLabelText('New branch name')).not.toBeInTheDocument();
  });

  it('keeps the create action visible when search returns no branch matches', async () => {
    const { user } = renderSelector();
    await openSelector(user);

    await user.type(screen.getByLabelText('Search branches'), 'does-not-exist-branch');

    expect(screen.getByText('No branches found.')).toBeInTheDocument();
    expect(screen.getByText('Create and checkout new branch...')).toBeInTheDocument();
  });

  it('manages focus between browse and create inputs', async () => {
    const { user } = renderSelector();
    await openSelector(user);

    const searchInput = screen.getByLabelText('Search branches');
    await waitFor(() => {
      expect(document.activeElement).toBe(searchInput);
    });

    await user.click(getCommandItemByText('Create and checkout new branch...'));

    const createInput = screen.getByLabelText('New branch name');
    await waitFor(() => {
      expect(document.activeElement).toBe(createInput);
    });

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByLabelText('Search branches'));
    });
  });

  it('creates and checks out on Enter, then closes on success', async () => {
    const { user, onCreateAndCheckout } = renderSelector();
    await openSelector(user);

    await user.click(getCommandItemByText('Create and checkout new branch...'));
    const createInput = screen.getByLabelText('New branch name');
    await user.type(createInput, 'feature/new-work');
    await user.keyboard('{Enter}');

    expect(onCreateAndCheckout).toHaveBeenCalledWith('feature/new-work');
    await waitFor(() => {
      expect(screen.queryByLabelText('Search branches')).not.toBeInTheDocument();
    });
  });
});
