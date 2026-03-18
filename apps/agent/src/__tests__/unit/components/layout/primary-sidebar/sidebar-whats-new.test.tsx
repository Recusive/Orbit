import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SidebarUpdateActions } from '@/components/layout/primary-sidebar/components/SidebarUpdateActions';
import { useUIStore } from '@/stores/ui/ui-store';

describe('SidebarUpdateActions', () => {
  beforeEach(() => {
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it("shows the What's new action when an update is available and the toast was dismissed", () => {
    render(
      <SidebarUpdateActions
        status="available"
        dismissed
        onDownloadOrRestart={vi.fn()}
        onOpenChangelog={() => {
          useUIStore.getState().openSettings('changelog');
        }}
      />
    );

    expect(screen.getByRole('button', { name: /Update available/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "What's new" })).toBeInTheDocument();
  });

  it("opens settings to the changelog section when What's new is clicked", async () => {
    const user = userEvent.setup();

    render(
      <SidebarUpdateActions
        status="available"
        dismissed
        onDownloadOrRestart={vi.fn()}
        onOpenChangelog={() => {
          useUIStore.getState().openSettings('changelog');
        }}
      />
    );

    await user.click(screen.getByRole('button', { name: "What's new" }));

    expect(useUIStore.getState().settingsOpen).toBe(true);
    expect(useUIStore.getState().settingsSection).toBe('changelog');
  });

  it("does not render the What's new action when no update is available", () => {
    render(
      <SidebarUpdateActions
        status="idle"
        dismissed
        onDownloadOrRestart={vi.fn()}
        onOpenChangelog={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: "What's new" })).not.toBeInTheDocument();
  });
});
