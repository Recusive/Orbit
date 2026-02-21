/**
 * SidebarItem Unit Tests
 *
 * Tests for the SidebarItem component used in the primary sidebar.
 *
 * The SidebarItem component:
 * - Renders an icon and label in a button
 * - Supports active state styling and keyboard shortcuts display
 * - Supports badge display with default and primary variants
 *
 * @see SidebarItem.tsx - Component implementation
 * @see types.ts - SidebarItemProps interface
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { SidebarItemProps } from '@/components/layout/primary-sidebar/types';
import type { FC } from 'react';

import { SidebarItem } from '@/components/layout/primary-sidebar/components/SidebarItem';

// =============================================================================
// Test Setup
// =============================================================================

/**
 * Mock icon component for testing.
 * Uses data-testid to verify icon rendering and className forwarding.
 */
const MockIcon: FC<{ className?: string }> = ({ className }) => (
  <svg data-testid="mock-icon" className={className} />
);

/**
 * Create default props for SidebarItem component.
 * Override specific props in individual tests.
 */
function createDefaultProps(overrides: Partial<SidebarItemProps> = {}): SidebarItemProps {
  return {
    icon: MockIcon,
    label: 'Test Label',
    ...overrides,
  };
}

/**
 * Helper to find the main button element.
 */
function getButton(): HTMLElement {
  return screen.getByRole('button');
}

// =============================================================================
// Unit Tests: Core Rendering
// =============================================================================

describe('SidebarItem', () => {
  describe('core rendering', () => {
    it('should render with icon and label', () => {
      render(<SidebarItem {...createDefaultProps()} />);

      expect(screen.getByTestId('mock-icon')).toBeInTheDocument();
      expect(screen.getByText('Test Label')).toBeInTheDocument();
    });

    it('should render as a button element', () => {
      render(<SidebarItem {...createDefaultProps()} />);

      const button = getButton();
      expect(button.tagName).toBe('BUTTON');
    });

    it('should call onClick when clicked', async () => {
      const onClick = vi.fn();
      const user = userEvent.setup();

      render(<SidebarItem {...createDefaultProps({ onClick })} />);

      await user.click(getButton());

      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('should call onClick on each click', async () => {
      const onClick = vi.fn();
      const user = userEvent.setup();

      render(<SidebarItem {...createDefaultProps({ onClick })} />);

      const button = getButton();
      await user.click(button);
      await user.click(button);
      await user.click(button);

      expect(onClick).toHaveBeenCalledTimes(3);
    });

    it('should always show label text', () => {
      render(<SidebarItem {...createDefaultProps()} />);

      const label = screen.getByText('Test Label');
      expect(label).toHaveClass('w-auto');
    });
  });

  // =============================================================================
  // Unit Tests: Active State
  // =============================================================================

  describe('active state', () => {
    it('should have foreground text color when active=true', () => {
      render(<SidebarItem {...createDefaultProps({ active: true })} />);

      const button = getButton();
      expect(button).toHaveClass('text-foreground');
    });

    it('should have sidebar text color when active=false', () => {
      render(<SidebarItem {...createDefaultProps({ active: false })} />);

      const button = getButton();
      expect(button).toHaveClass('text-sidebar-foreground');
    });

    it('should have sidebar text color by default (no active prop)', () => {
      render(<SidebarItem {...createDefaultProps()} />);

      const button = getButton();
      expect(button).toHaveClass('text-sidebar-foreground');
    });
  });

  // =============================================================================
  // Unit Tests: Icon Sizes
  // =============================================================================

  describe('icon sizes', () => {
    it('should use default icon size (h-4 w-4) when no size prop', () => {
      render(<SidebarItem {...createDefaultProps()} />);

      const icon = screen.getByTestId('mock-icon');
      expect(icon).toHaveClass('h-4');
      expect(icon).toHaveClass('w-4');
    });

    it('should use small icon size (h-3 w-3) when small=true', () => {
      render(<SidebarItem {...createDefaultProps({ small: true })} />);

      const icon = screen.getByTestId('mock-icon');
      expect(icon).toHaveClass('h-3');
      expect(icon).toHaveClass('w-3');
    });

    it('should use large icon size (h-4.5 w-4.5) when large=true', () => {
      render(<SidebarItem {...createDefaultProps({ large: true })} />);

      const icon = screen.getByTestId('mock-icon');
      expect(icon).toHaveClass('h-4.5');
      expect(icon).toHaveClass('w-4.5');
    });
  });

  // =============================================================================
  // Unit Tests: Keyboard Shortcuts
  // =============================================================================

  describe('keyboard shortcuts', () => {
    it('should render keyboard shortcuts when provided', () => {
      render(<SidebarItem {...createDefaultProps({ shortcut: ['⌘', ','] })} />);

      expect(screen.getByText('⌘')).toBeInTheDocument();
      expect(screen.getByText(',')).toBeInTheDocument();
    });

    it('should not render keyboard shortcuts when not provided', () => {
      render(<SidebarItem {...createDefaultProps()} />);

      // The KbdGroup should not be present
      const button = getButton();
      expect(button.querySelector('[class*="KbdGroup"]')).not.toBeInTheDocument();
    });
  });

  // =============================================================================
  // Unit Tests: Badge
  // =============================================================================

  describe('badge', () => {
    it('should render badge when provided', () => {
      render(<SidebarItem {...createDefaultProps({ badge: 'New' })} />);

      expect(screen.getByText('New')).toBeInTheDocument();
    });

    it('should not render badge when not provided', () => {
      render(<SidebarItem {...createDefaultProps()} />);

      // No badge element should exist
      expect(screen.queryByText('New')).not.toBeInTheDocument();
    });
  });

  // =============================================================================
  // Edge Cases
  // =============================================================================

  describe('edge cases: no onClick handler', () => {
    it('should render without error when onClick is not provided', () => {
      const propsWithoutOnClick: SidebarItemProps = {
        icon: MockIcon,
        label: 'Test Label',
      };

      // Should not throw
      expect(() => {
        render(<SidebarItem {...propsWithoutOnClick} />);
      }).not.toThrow();
    });

    it('should not crash when clicked without onClick handler', async () => {
      const user = userEvent.setup();

      const propsWithoutOnClick: SidebarItemProps = {
        icon: MockIcon,
        label: 'Test Label',
      };

      render(<SidebarItem {...propsWithoutOnClick} />);

      // Should not throw when clicked
      await expect(user.click(getButton())).resolves.not.toThrow();
    });
  });

  describe('edge cases: rapid interactions', () => {
    it('should handle rapid clicks without errors', async () => {
      const onClick = vi.fn();
      const user = userEvent.setup();

      render(<SidebarItem {...createDefaultProps({ onClick })} />);

      const button = getButton();

      // Rapid fire clicks
      await Promise.all([
        user.click(button),
        user.click(button),
        user.click(button),
        user.click(button),
        user.click(button),
      ]);

      expect(onClick).toHaveBeenCalled();
    });
  });

  describe('edge cases: keyboard activation', () => {
    it('should call onClick when Enter key is pressed', async () => {
      const onClick = vi.fn();
      const user = userEvent.setup();

      render(<SidebarItem {...createDefaultProps({ onClick })} />);

      const button = getButton();
      button.focus();
      await user.keyboard('{Enter}');

      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('should call onClick when Space key is pressed', async () => {
      const onClick = vi.fn();
      const user = userEvent.setup();

      render(<SidebarItem {...createDefaultProps({ onClick })} />);

      const button = getButton();
      button.focus();
      await user.keyboard(' ');

      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('should be focusable via Tab key', async () => {
      const user = userEvent.setup();

      render(<SidebarItem {...createDefaultProps()} />);

      await user.tab();

      const button = getButton();
      expect(document.activeElement).toBe(button);
    });
  });

  describe('edge cases: common button attributes', () => {
    it('should have transition classes for smooth interactions', () => {
      render(<SidebarItem {...createDefaultProps()} />);

      const button = getButton();
      expect(button).toHaveClass('transition-[background-color,transform]');
    });

    it('should have active scale effect class', () => {
      render(<SidebarItem {...createDefaultProps()} />);

      const button = getButton();
      expect(button).toHaveClass('active:scale-[0.98]');
    });

    it('should have hover background class', () => {
      render(<SidebarItem {...createDefaultProps()} />);

      const button = getButton();
      expect(button).toHaveClass('hover:bg-lg-sidebar-hover');
    });
  });

  describe('edge cases: icon className forwarding', () => {
    it('should forward shrink-0 class to icon', () => {
      render(<SidebarItem {...createDefaultProps()} />);

      const icon = screen.getByTestId('mock-icon');
      expect(icon).toHaveClass('shrink-0');
    });
  });
});
