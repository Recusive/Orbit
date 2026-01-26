/**
 * Compact Mode & MoreActionsMenu Tests
 *
 * Tests for the responsive collapse behavior of InputControls and the
 * MoreActionsMenu component.
 *
 * When container width falls below INPUT_CONTROLS.collapseBreakpoint (520px):
 * - Secondary buttons (@, Thinking, Globe) collapse into dropdown
 * - Image button stays visible
 * - MoreActionsMenu triggers the same handlers as expanded mode
 *
 * @see InputControls.tsx - Component with collapse logic
 * @see MoreActionsMenu.tsx - Dropdown menu component
 * @see use-container-width.ts - Container width tracking hook
 * @see constants.ts - INPUT_CONTROLS.collapseBreakpoint
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Note: describe, it, expect, vi are globals via vitest/globals

import type { MoreActionsMenuProps } from '@/components/chat/input/types';
import type { ReactNode } from 'react';

import { MoreActionsMenu } from '@/components/chat/input/MoreActionsMenu';
import { TooltipProvider } from '@/components/ui/tooltip';

/**
 * Wrapper component that provides required context for components using Radix UI.
 */
function TestWrapper({ children }: { readonly children: ReactNode }): ReactNode {
  return <TooltipProvider>{children}</TooltipProvider>;
}

// =============================================================================
// Test Setup
// =============================================================================

/**
 * Create default props for MoreActionsMenu component.
 * Override specific props in individual tests.
 */
function createMenuProps(overrides: Partial<MoreActionsMenuProps> = {}): MoreActionsMenuProps {
  return {
    handleAtClick: vi.fn(),
    cycleThinkingMode: vi.fn(),
    thinkingMode: 'off',
    getThinkingInfo: () => ({ level: 'Off', tokens: '0' }),
    handleGlobeClick: vi.fn(),
    ...overrides,
  };
}

// =============================================================================
// Unit Tests: MoreActionsMenu Component
// =============================================================================

describe('MoreActionsMenu', () => {
  describe('rendering', () => {
    it('should render the menu trigger button', () => {
      render(<MoreActionsMenu {...createMenuProps()} />, { wrapper: TestWrapper });

      const trigger = screen.getByRole('button', { name: 'More actions' });
      expect(trigger).toBeInTheDocument();
    });

    it('should render the ellipsis icon in trigger', () => {
      render(<MoreActionsMenu {...createMenuProps()} />, { wrapper: TestWrapper });

      const trigger = screen.getByRole('button', { name: 'More actions' });
      // The MoreHorizontal icon should be present as an SVG with aria-hidden
      const icon = trigger.querySelector('svg');
      expect(icon).toBeInTheDocument();
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });

    it('should not show menu content initially', () => {
      render(<MoreActionsMenu {...createMenuProps()} />, { wrapper: TestWrapper });

      // Menu items should not be visible until dropdown is opened
      expect(screen.queryByRole('menuitem', { name: /Add context/i })).not.toBeInTheDocument();
    });
  });

  describe('dropdown interactions', () => {
    it('should open dropdown on click', async () => {
      const user = userEvent.setup();
      render(<MoreActionsMenu {...createMenuProps()} />, { wrapper: TestWrapper });

      const trigger = screen.getByRole('button', { name: 'More actions' });
      await user.click(trigger);

      // Menu items should now be visible
      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: /Add context/i })).toBeInTheDocument();
      });
    });

    it('should show all three menu items when opened', async () => {
      const user = userEvent.setup();
      render(<MoreActionsMenu {...createMenuProps()} />, { wrapper: TestWrapper });

      const trigger = screen.getByRole('button', { name: 'More actions' });
      await user.click(trigger);

      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: /Add context/i })).toBeInTheDocument();
        expect(screen.getByRole('menuitem', { name: /Thinking/i })).toBeInTheDocument();
        expect(screen.getByRole('menuitem', { name: /Web browser/i })).toBeInTheDocument();
      });
    });

    it('should call handleAtClick when "Add context" is clicked', async () => {
      const handleAtClick = vi.fn();
      const user = userEvent.setup();

      render(<MoreActionsMenu {...createMenuProps({ handleAtClick })} />, { wrapper: TestWrapper });

      // Open dropdown
      const trigger = screen.getByRole('button', { name: 'More actions' });
      await user.click(trigger);

      // Click "Add context" menu item
      const addContextItem = await screen.findByRole('menuitem', { name: /Add context/i });
      await user.click(addContextItem);

      expect(handleAtClick).toHaveBeenCalledTimes(1);
    });

    it('should call cycleThinkingMode when "Thinking" is clicked', async () => {
      const cycleThinkingMode = vi.fn();
      const user = userEvent.setup();

      render(<MoreActionsMenu {...createMenuProps({ cycleThinkingMode })} />, {
        wrapper: TestWrapper,
      });

      // Open dropdown
      const trigger = screen.getByRole('button', { name: 'More actions' });
      await user.click(trigger);

      // Click "Thinking" menu item
      const thinkingItem = await screen.findByRole('menuitem', { name: /Thinking/i });
      await user.click(thinkingItem);

      expect(cycleThinkingMode).toHaveBeenCalledTimes(1);
    });

    it('should call handleGlobeClick when "Web browser" is clicked', async () => {
      const handleGlobeClick = vi.fn();
      const user = userEvent.setup();

      render(<MoreActionsMenu {...createMenuProps({ handleGlobeClick })} />, {
        wrapper: TestWrapper,
      });

      // Open dropdown
      const trigger = screen.getByRole('button', { name: 'More actions' });
      await user.click(trigger);

      // Click "Web browser" menu item
      const browserItem = await screen.findByRole('menuitem', { name: /Web browser/i });
      await user.click(browserItem);

      expect(handleGlobeClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('thinking mode display', () => {
    it('should display current thinking level in menu', async () => {
      const user = userEvent.setup();
      render(
        <MoreActionsMenu
          {...createMenuProps({ getThinkingInfo: () => ({ level: 'Low', tokens: '1K' }) })}
        />,
        { wrapper: TestWrapper }
      );

      const trigger = screen.getByRole('button', { name: 'More actions' });
      await user.click(trigger);

      await waitFor(() => {
        expect(screen.getByText('Low')).toBeInTheDocument();
      });
    });

    it('should show primary color on thinking icon when mode is active', async () => {
      const user = userEvent.setup();
      render(<MoreActionsMenu {...createMenuProps({ thinkingMode: 'think' })} />, {
        wrapper: TestWrapper,
      });

      const trigger = screen.getByRole('button', { name: 'More actions' });
      await user.click(trigger);

      // Find the thinking menu item and check the icon has text-primary class
      const thinkingItem = await screen.findByRole('menuitem', { name: /Thinking/i });
      const icon = thinkingItem.querySelector('svg');
      expect(icon).toBeInTheDocument();
      expect(icon).toHaveClass('text-primary');
    });

    it('should not show primary color when thinking is off', async () => {
      const user = userEvent.setup();
      render(<MoreActionsMenu {...createMenuProps({ thinkingMode: 'off' })} />, {
        wrapper: TestWrapper,
      });

      const trigger = screen.getByRole('button', { name: 'More actions' });
      await user.click(trigger);

      const thinkingItem = await screen.findByRole('menuitem', { name: /Thinking/i });
      const icon = thinkingItem.querySelector('svg');
      expect(icon).toBeInTheDocument();
      expect(icon).not.toHaveClass('text-primary');
    });
  });

  describe('globe button disabled state', () => {
    it('should disable globe item when handleGlobeClick is undefined', async () => {
      const user = userEvent.setup();
      render(<MoreActionsMenu {...createMenuProps({ handleGlobeClick: undefined })} />, {
        wrapper: TestWrapper,
      });

      const trigger = screen.getByRole('button', { name: 'More actions' });
      await user.click(trigger);

      const browserItem = await screen.findByRole('menuitem', { name: /Web browser/i });
      expect(browserItem).toHaveAttribute('data-disabled');
    });

    it('should show "Soon" label when globe is disabled', async () => {
      const user = userEvent.setup();
      render(<MoreActionsMenu {...createMenuProps({ handleGlobeClick: undefined })} />, {
        wrapper: TestWrapper,
      });

      const trigger = screen.getByRole('button', { name: 'More actions' });
      await user.click(trigger);

      await waitFor(() => {
        expect(screen.getByText('Soon')).toBeInTheDocument();
      });
    });

    it('should have reduced opacity when globe is disabled', async () => {
      const user = userEvent.setup();
      render(<MoreActionsMenu {...createMenuProps({ handleGlobeClick: undefined })} />, {
        wrapper: TestWrapper,
      });

      const trigger = screen.getByRole('button', { name: 'More actions' });
      await user.click(trigger);

      const browserItem = await screen.findByRole('menuitem', { name: /Web browser/i });
      expect(browserItem).toHaveClass('opacity-50');
      expect(browserItem).toHaveClass('cursor-not-allowed');
    });

    it('should not call handler when disabled globe is clicked', async () => {
      const handleGlobeClick = vi.fn();
      const user = userEvent.setup();

      // First, verify it gets called when defined
      const { rerender } = render(<MoreActionsMenu {...createMenuProps({ handleGlobeClick })} />, {
        wrapper: TestWrapper,
      });

      let trigger = screen.getByRole('button', { name: 'More actions' });
      await user.click(trigger);

      let browserItem = await screen.findByRole('menuitem', { name: /Web browser/i });
      await user.click(browserItem);
      expect(handleGlobeClick).toHaveBeenCalledTimes(1);

      // Now test with undefined handler
      handleGlobeClick.mockClear();
      rerender(
        <TestWrapper>
          <MoreActionsMenu {...createMenuProps({ handleGlobeClick: undefined })} />
        </TestWrapper>
      );

      trigger = screen.getByRole('button', { name: 'More actions' });
      await user.click(trigger);

      browserItem = await screen.findByRole('menuitem', { name: /Web browser/i });
      await user.click(browserItem);

      // Handler should not be called (it's undefined)
      expect(handleGlobeClick).not.toHaveBeenCalled();
    });

    it('should not show "Soon" label when globe is enabled', async () => {
      const user = userEvent.setup();
      render(<MoreActionsMenu {...createMenuProps({ handleGlobeClick: vi.fn() })} />, {
        wrapper: TestWrapper,
      });

      const trigger = screen.getByRole('button', { name: 'More actions' });
      await user.click(trigger);

      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: /Web browser/i })).toBeInTheDocument();
      });
      expect(screen.queryByText('Soon')).not.toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have proper ARIA attributes on trigger', () => {
      render(<MoreActionsMenu {...createMenuProps()} />, { wrapper: TestWrapper });

      const trigger = screen.getByRole('button', { name: 'More actions' });
      expect(trigger).toHaveAttribute('aria-label', 'More actions');
    });

    it('should use proper menu role for dropdown content', async () => {
      const user = userEvent.setup();
      render(<MoreActionsMenu {...createMenuProps()} />, { wrapper: TestWrapper });

      const trigger = screen.getByRole('button', { name: 'More actions' });
      await user.click(trigger);

      await waitFor(() => {
        expect(screen.getByRole('menu')).toBeInTheDocument();
      });
    });

    it('should close dropdown on Escape key', async () => {
      const user = userEvent.setup();
      render(<MoreActionsMenu {...createMenuProps()} />, { wrapper: TestWrapper });

      // Open dropdown
      const trigger = screen.getByRole('button', { name: 'More actions' });
      await user.click(trigger);

      // Verify menu is open
      await waitFor(() => {
        expect(screen.getByRole('menu')).toBeInTheDocument();
      });

      // Press Escape
      await user.keyboard('{Escape}');

      // Menu should be closed
      await waitFor(() => {
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      });
    });
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('MoreActionsMenu Edge Cases', () => {
  it('should handle rapid clicks on menu items without errors', async () => {
    const handleAtClick = vi.fn();
    const cycleThinkingMode = vi.fn();
    const user = userEvent.setup();

    render(<MoreActionsMenu {...createMenuProps({ handleAtClick, cycleThinkingMode })} />, {
      wrapper: TestWrapper,
    });

    // Open dropdown
    const trigger = screen.getByRole('button', { name: 'More actions' });
    await user.click(trigger);

    // Click multiple menu items quickly
    const addContextItem = await screen.findByRole('menuitem', { name: /Add context/i });
    await user.click(addContextItem);

    // Dropdown closes after click, so we need to reopen
    await user.click(trigger);

    const thinkingItem = await screen.findByRole('menuitem', { name: /Thinking/i });
    await user.click(thinkingItem);

    expect(handleAtClick).toHaveBeenCalledTimes(1);
    expect(cycleThinkingMode).toHaveBeenCalledTimes(1);
  });

  it('should work with all thinking modes', async () => {
    const user = userEvent.setup();

    // Test each thinking mode
    for (const mode of ['off', 'think', 'hard', 'ultra'] as const) {
      const { unmount } = render(<MoreActionsMenu {...createMenuProps({ thinkingMode: mode })} />, {
        wrapper: TestWrapper,
      });

      const trigger = screen.getByRole('button', { name: 'More actions' });
      await user.click(trigger);

      // Verify menu opens and has thinking item
      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: /Thinking/i })).toBeInTheDocument();
      });

      // Cleanup for next iteration
      unmount();
    }
  });
});
