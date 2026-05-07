import { render, screen } from '@testing-library/react';

import { TerminalPanel } from '@/components/terminal/terminal-panel';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useTerminalStore } from '@/stores/terminal/terminal-store';
import { useUIStore } from '@/stores/ui/ui-store';

const terminalManager = vi.hoisted(() => ({
  cleanupOrphanedInstances: vi.fn(),
  createInstance: vi.fn(),
  getInstance: vi.fn(() => undefined),
  isInitialized: vi.fn(() => false),
}));

vi.mock('@/hooks/terminal/use-terminal-instance-manager', () => ({
  useTerminalInstanceManager: () => terminalManager,
}));

function renderTerminalPanel(collapsed = false): void {
  render(
    <TooltipProvider>
      <TerminalPanel variant="full-width" collapsed={collapsed} />
    </TooltipProvider>
  );
}

describe('TerminalPanel accessibility', () => {
  beforeEach(() => {
    useUIStore.setState(useUIStore.getInitialState(), true);
    useTerminalStore.setState(useTerminalStore.getInitialState(), true);
    vi.clearAllMocks();
  });

  it('labels header icon buttons for assistive technology', () => {
    renderTerminalPanel(false);

    expect(screen.getByTitle('Find (Cmd+F)')).toHaveAttribute('aria-label', 'Find in terminal');
    expect(screen.getByTitle('New Terminal')).toHaveAttribute('aria-label', 'New terminal');
    expect(screen.getByTitle('Collapse terminal')).toHaveAttribute(
      'aria-label',
      'Collapse terminal'
    );
  });

  it('updates the collapse toggle label when the panel is collapsed', () => {
    renderTerminalPanel(true);

    expect(screen.getByTitle('Expand terminal')).toHaveAttribute('aria-label', 'Expand terminal');
  });
});
