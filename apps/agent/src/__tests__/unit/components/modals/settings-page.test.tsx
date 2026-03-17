import { act, render, screen } from '@testing-library/react';

import { SettingsPage } from '@/components/modals/settings/SettingsPage';
import { useUIStore } from '@/stores/ui/ui-store';

vi.mock('@/components/modals/settings/pages', () => ({
  SETTINGS_PAGE_COMPONENTS: {
    agent: () => <div data-testid="settings-agent-page">Agent Settings</div>,
    providers: () => <div data-testid="settings-providers-page">Providers Settings</div>,
  },
}));

vi.mock('@/hooks/ui', () => ({
  useSmoothScroll: () => () => {
    /* noop */
  },
}));

describe('SettingsPage', () => {
  beforeEach(() => {
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('renders the active settings section', () => {
    useUIStore.setState({ settingsSection: 'providers', settingsOpen: true });

    render(<SettingsPage />);

    expect(screen.getByTestId('settings-providers-page')).toBeInTheDocument();
  });

  it('closes settings on Escape when no settings child dialog is open', () => {
    useUIStore.setState({ settingsSection: 'agent', settingsOpen: true });

    render(<SettingsPage />);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(useUIStore.getState().settingsOpen).toBe(false);
  });

  it('does not close settings on Escape while a settings child dialog is open', () => {
    useUIStore.setState({ settingsSection: 'agent', settingsOpen: true });

    const childDialog = document.createElement('div');
    childDialog.setAttribute('data-settings-child-dialog', 'true');
    childDialog.setAttribute('data-state', 'open');
    document.body.appendChild(childDialog);

    render(<SettingsPage />);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(useUIStore.getState().settingsOpen).toBe(true);

    childDialog.remove();
  });
});
