import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ReactElement, ReactNode } from 'react';

const { mockToastCustom, mockToastDismiss } = vi.hoisted(() => ({
  mockToastCustom: vi.fn(),
  mockToastDismiss: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    custom: mockToastCustom,
    dismiss: mockToastDismiss,
  },
}));

import { showUpdateAvailable } from '@/components/ui/update-toast';
import { useUIStore } from '@/stores/ui/ui-store';

describe('showUpdateAvailable changelog action', () => {
  let renderedToast: ReactElement | null;

  beforeEach(() => {
    renderedToast = null;
    vi.clearAllMocks();
    useUIStore.setState(useUIStore.getInitialState(), true);

    mockToastCustom.mockImplementation((renderer: () => ReactNode) => {
      const result = renderer();
      renderedToast = result as ReactElement;
      return 'orbit-update';
    });
  });

  it('opens settings to the changelog section when the Changelog button is clicked', async () => {
    const user = userEvent.setup();

    showUpdateAvailable('0.0.7', vi.fn(), vi.fn());

    if (renderedToast === null) {
      throw new Error('Expected toast renderer to be invoked');
    }

    render(renderedToast);
    await user.click(screen.getByRole('button', { name: 'Changelog' }));

    expect(useUIStore.getState().settingsOpen).toBe(true);
    expect(useUIStore.getState().settingsSection).toBe('changelog');
  });

  it('does not dismiss the toast when the Changelog button is clicked', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();

    showUpdateAvailable('0.0.7', vi.fn(), onDismiss);

    if (renderedToast === null) {
      throw new Error('Expected toast renderer to be invoked');
    }

    render(renderedToast);
    await user.click(screen.getByRole('button', { name: 'Changelog' }));

    expect(mockToastDismiss).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
