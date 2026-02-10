/**
 * SidebarItem Unit Tests
 *
 * Tests for the SidebarItem component used in the primary sidebar.
 *
 * The SidebarItem component:
 * - Renders an icon and label in a button
 * - Has two visual variants: full button (default) and compact square (equalSpacing)
 * - Handles collapsed state with animated width/opacity transitions
 * - Supports active state styling and keyboard shortcuts display
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
    collapsed: false,
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
  });

  // =============================================================================
  // Unit Tests: Collapsed State
  // =============================================================================

  describe('collapsed state', () => {
    it('should have hidden label classes when collapsed=true', () => {
      render(<SidebarItem {...createDefaultProps({ collapsed: true })} />);

      const label = screen.getByText('Test Label');
      expect(label).toHaveClass('w-0');
      expect(label).toHaveClass('opacity-0');
    });

    it('should have visible label classes when collapsed=false', () => {
      render(<SidebarItem {...createDefaultProps({ collapsed: false })} />);

      const label = screen.getByText('Test Label');
      expect(label).toHaveClass('w-auto');
      expect(label).toHaveClass('opacity-100');
    });

    it('should have title attribute when collapsed for tooltip', () => {
      render(<SidebarItem {...createDefaultProps({ collapsed: true })} />);

      const button = getButton();
      expect(button).toHaveAttribute('title', 'Test Label');
    });

    it('should not have title attribute when expanded', () => {
      render(<SidebarItem {...createDefaultProps({ collapsed: false })} />);

      const button = getButton();
      expect(button).not.toHaveAttribute('title');
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
    it('should render keyboard shortcuts when provided and not collapsed', () => {
      render(<SidebarItem {...createDefaultProps({ shortcut: ['⌘', ','], collapsed: false })} />);

      expect(screen.getByText('⌘')).toBeInTheDocument();
      expect(screen.getByText(',')).toBeInTheDocument();
    });

    it('should not render keyboard shortcuts when collapsed', () => {
      render(<SidebarItem {...createDefaultProps({ shortcut: ['⌘', ','], collapsed: true })} />);

      expect(screen.queryByText('⌘')).not.toBeInTheDocument();
      expect(screen.queryByText(',')).not.toBeInTheDocument();
    });

    it('should not render keyboard shortcuts when not provided', () => {
      render(<SidebarItem {...createDefaultProps({ collapsed: false })} />);

      // The KbdGroup should not be present
      const button = getButton();
      expect(button.querySelector('[class*="KbdGroup"]')).not.toBeInTheDocument();
    });
  });

  // =============================================================================
  // Unit Tests: Equal Spacing Variant (Collapsed Square Button)
  // =============================================================================

  describe('equalSpacing variant', () => {
    it('should render compact square button when equalSpacing=true', () => {
      render(<SidebarItem {...createDefaultProps({ equalSpacing: true })} />);

      const button = getButton();
      // The compact variant has different classes
      expect(button).toHaveClass('h-7');
      expect(button).toHaveClass('w-7');
      expect(button).toHaveClass('rounded-md');
    });

    it('should render full button when equalSpacing=false', () => {
      render(<SidebarItem {...createDefaultProps({ equalSpacing: false })} />);

      const button = getButton();
      // The full variant has h-8 and rounded-lg
      expect(button).toHaveClass('h-8');
      expect(button).toHaveClass('rounded-lg');
    });

    it('should have title attribute in equalSpacing variant', () => {
      render(<SidebarItem {...createDefaultProps({ equalSpacing: true })} />);

      const button = getButton();
      expect(button).toHaveAttribute('title', 'Test Label');
    });

    it('should call onClick in equalSpacing variant', async () => {
      const onClick = vi.fn();
      const user = userEvent.setup();

      render(<SidebarItem {...createDefaultProps({ equalSpacing: true, onClick })} />);

      await user.click(getButton());

      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('should have active styling in equalSpacing variant when active=true', () => {
      render(<SidebarItem {...createDefaultProps({ equalSpacing: true, active: true })} />);

      const button = getButton();
      expect(button).toHaveClass('text-foreground');
    });

    it('should have sidebar text styling in equalSpacing variant when active=false', () => {
      render(<SidebarItem {...createDefaultProps({ equalSpacing: true, active: false })} />);

      const button = getButton();
      expect(button).toHaveClass('text-sidebar-foreground');
    });

    it('should not render label text in equalSpacing variant', () => {
      render(<SidebarItem {...createDefaultProps({ equalSpacing: true })} />);

      // Label should not be visible (only icon and title attribute)
      const button = getButton();
      // The label text should not be a direct child in the compact variant
      expect(button.querySelector('span')).not.toBeInTheDocument();
    });
  });

  // =============================================================================
  // Edge Cases
  // =============================================================================

  describe('edge cases: no onClick handler', () => {
    it('should render without error when onClick is not provided', () => {
      // Create props without onClick (omitted, not undefined)
      const propsWithoutOnClick: SidebarItemProps = {
        icon: MockIcon,
        label: 'Test Label',
        collapsed: false,
      };

      // Should not throw
      expect(() => {
        render(<SidebarItem {...propsWithoutOnClick} />);
      }).not.toThrow();
    });

    it('should not crash when clicked without onClick handler', async () => {
      const user = userEvent.setup();

      // Create props without onClick (omitted, not undefined)
      const propsWithoutOnClick: SidebarItemProps = {
        icon: MockIcon,
        label: 'Test Label',
        collapsed: false,
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
      expect(button).toHaveClass('hover:bg-gray-3');
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
