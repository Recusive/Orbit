import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ScopePopover } from '@/components/modals/skills';

describe('ScopePopover', () => {
  it('gives scope option buttons concise accessible names', async () => {
    const user = userEvent.setup();

    render(
      <ScopePopover hasWorkspace={true} isInstalling={false} onSelectScope={() => undefined} />
    );

    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(screen.getByRole('button', { name: 'Install for this project' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Install for all projects' })).toBeInTheDocument();
  });
});
