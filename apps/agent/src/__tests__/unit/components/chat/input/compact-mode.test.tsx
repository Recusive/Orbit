/**
 * Compact Mode & MoreActionsMenu Tests
 *
 * Tests for the responsive collapse behavior of InputControls and the
 * MoreActionsMenu component.
 *
 * When container width falls below INPUT_CONTROLS.collapseBreakpoint (520px):
 * - Thinking/Effort button collapses into dropdown
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
    model: 'sonnet',
    cycleThinkingMode: vi.fn(),
    thinkingMode: 'off',
    getThinkingInfo: () => ({ level: 'Off', tokens: '0' }),
    cycleEffortLevel: vi.fn(),
    effortLevel: 'high',
    getEffortInfo: () => ({ level: 'High', description: 'Thorough analysis' }),
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

    it('should render the icon in trigger', () => {
      render(<MoreActionsMenu {...createMenuProps()} />, { wrapper: TestWrapper });

      const trigger = screen.getByRole('button', { name: 'More actions' });
      const icon = trigger.querySelector('svg');
      expect(icon).toBeInTheDocument();
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });

    it('should not show menu content initially', () => {
      render(<MoreActionsMenu {...createMenuProps()} />, { wrapper: TestWrapper });

      // Menu items should not be visible until dropdown is opened
      expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
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
        expect(screen.getByRole('menuitem', { name: /Thinking/i })).toBeInTheDocument();
      });
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

    it('should show effort item instead of thinking for Opus 4.6', async () => {
      const user = userEvent.setup();
      render(<MoreActionsMenu {...createMenuProps({ model: 'claude-opus-4-6' })} />, {
        wrapper: TestWrapper,
      });

      const trigger = screen.getByRole('button', { name: 'More actions' });
      await user.click(trigger);

      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: /Effort/i })).toBeInTheDocument();
      });
      expect(screen.queryByRole('menuitem', { name: /Thinking/i })).not.toBeInTheDocument();
    });

    it('should call cycleEffortLevel when "Effort" is clicked', async () => {
      const cycleEffortLevel = vi.fn();
      const user = userEvent.setup();

      render(
        <MoreActionsMenu {...createMenuProps({ model: 'claude-opus-4-6', cycleEffortLevel })} />,
        { wrapper: TestWrapper }
      );

      const trigger = screen.getByRole('button', { name: 'More actions' });
      await user.click(trigger);

      const effortItem = await screen.findByRole('menuitem', { name: /Effort/i });
      await user.click(effortItem);

      expect(cycleEffortLevel).toHaveBeenCalledTimes(1);
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
