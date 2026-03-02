import { act, render } from '@testing-library/react';

import { RootLayout } from '@/components/layout/root-layout';
import { useUIStore } from '@/stores/ui/ui-store';

vi.mock('@/components/layout/chat-area', () => ({
  ChatArea: () => <div data-testid="chat-area" />,
}));

vi.mock('@/components/modals', () => ({
  QuickOpen: () => null,
  GoToLineDialog: () => null,
}));

vi.mock('@/hooks/agent/use-tauri', () => ({
  useTauri: () => ({}),
}));

vi.mock('@/hooks/git/use-git-polling', () => ({
  useGitPolling: (): void => {
    /* noop mock */
  },
}));

vi.mock('@/hooks/ui/use-keyboard-shortcuts', () => ({
  useDefaultKeyboardShortcuts: (): void => {
    /* noop mock */
  },
}));

describe('RootLayout toggleVault event handling', () => {
  beforeEach(() => {
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('toggles vault when workspace is open', () => {
    useUIStore.setState({ workspacePath: '/repo', vaultOpen: false });
    render(<RootLayout />);

    act(() => {
      window.dispatchEvent(new CustomEvent('toggleVault'));
    });

    expect(useUIStore.getState().vaultOpen).toBe(true);
  });

  it('is a no-op when workspace is not open', () => {
    useUIStore.setState({ workspacePath: null, vaultOpen: false });
    render(<RootLayout />);

    act(() => {
      window.dispatchEvent(new CustomEvent('toggleVault'));
    });

    expect(useUIStore.getState().vaultOpen).toBe(false);
  });
});
