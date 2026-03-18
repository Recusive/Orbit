import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  SettingsNavList,
  NAV_GROUPS,
} from '@/components/layout/primary-sidebar/components/SettingsNavList';
import { NAV_ITEMS } from '@/components/modals/settings/SettingsSidebar';
import { useUIStore } from '@/stores/ui/ui-store';

describe('settings changelog navigation', () => {
  beforeEach(() => {
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('includes changelog in the grouped settings navigation config', () => {
    expect(NAV_GROUPS.some((group) => group.ids.includes('changelog'))).toBe(true);
    expect(NAV_ITEMS.some((item) => item.id === 'changelog')).toBe(true);
  });

  it('opens the changelog settings page when the changelog nav item is clicked', async () => {
    const user = userEvent.setup();

    render(<SettingsNavList />);

    await user.click(screen.getByRole('button', { name: 'Changelog' }));

    expect(useUIStore.getState().settingsOpen).toBe(true);
    expect(useUIStore.getState().settingsSection).toBe('changelog');
  });
});
