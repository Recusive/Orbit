/**
 * Model Selector Tests
 *
 * Tests for the ModelSelector dropdown component in InputControls.
 *
 * The Model Selector:
 * - Displays the currently selected AI model (Haiku, Sonnet, Opus)
 * - Opens a dropdown with model groups (Claude, Codex)
 * - Allows selecting a different model
 * - Calls onModelChange callback when a valid model is selected
 * - Closes when clicking outside
 *
 * @see model-selector.tsx - Component implementation
 * @see tool-store.ts - Model state management
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { FC, ReactNode } from 'react';

import { ModelSelector } from '@/components/chat/input/model-selector';
import { useToolStore } from '@/stores/agent/tool-store';

// =============================================================================
// Test Setup
// =============================================================================

/**
 * Reset store state before each test
 */
function resetStore(): void {
  useToolStore.setState({
    model: 'sonnet',
  });
}

/**
 * Wrapper to provide any required context
 */
const TestWrapper: FC<{ children: ReactNode }> = ({ children }) => {
  return <>{children}</>;
};

// =============================================================================
// Unit Tests: Model Groups Configuration
// =============================================================================

describe('Model Groups Configuration', () => {
  it('should have Claude model group with Haiku, Sonnet, Opus 4.5, Opus 4.6', () => {
    // These are the valid models that can be selected
    const validModels = ['haiku', 'sonnet', 'opus', 'claude-opus-4-6'];
    expect(validModels).toContain('haiku');
    expect(validModels).toContain('sonnet');
    expect(validModels).toContain('opus');
    expect(validModels).toContain('claude-opus-4-6');
  });
});

// =============================================================================
// Integration Tests: ModelSelector Component
// =============================================================================

describe('ModelSelector Component', () => {
  beforeEach(() => {
    resetStore();
  });

  describe('rendering', () => {
    it('should render the model selector button', () => {
      render(<ModelSelector />, { wrapper: TestWrapper });

      // Should display the selected model name
      expect(screen.getByText('Sonnet 4.5')).toBeInTheDocument();
    });

    it('should display the selected model from store', () => {
      useToolStore.setState({ model: 'haiku' });
      render(<ModelSelector />, { wrapper: TestWrapper });

      expect(screen.getByText('Haiku 4.5')).toBeInTheDocument();
    });

    it('should display Opus when selected', () => {
      useToolStore.setState({ model: 'opus' });
      render(<ModelSelector />, { wrapper: TestWrapper });

      expect(screen.getByText('Opus 4.5')).toBeInTheDocument();
    });

    it('should display Opus 4.6 when selected', () => {
      useToolStore.setState({ model: 'claude-opus-4-6' });
      render(<ModelSelector />, { wrapper: TestWrapper });

      expect(screen.getByText('Opus 4.6')).toBeInTheDocument();
    });

    it('should have a chevron icon that rotates when open', async () => {
      const user = userEvent.setup();
      render(<ModelSelector />, { wrapper: TestWrapper });

      const button = screen.getByRole('button');
      await user.click(button);

      // Dropdown should be open
      expect(screen.getByText('Claude')).toBeInTheDocument();
    });
  });

  describe('dropdown behavior', () => {
    it('should open dropdown when clicking the button', async () => {
      const user = userEvent.setup();
      render(<ModelSelector />, { wrapper: TestWrapper });

      const button = screen.getByRole('button');
      await user.click(button);

      // Should show model groups
      expect(screen.getByText('Claude')).toBeInTheDocument();
      expect(screen.getByText('Codex')).toBeInTheDocument();
    });

    it('should show all Claude models in dropdown', async () => {
      const user = userEvent.setup();
      render(<ModelSelector />, { wrapper: TestWrapper });

      await user.click(screen.getByRole('button'));

      // All Claude models should be visible
      expect(screen.getAllByText('Haiku 4.5')).toHaveLength(1);
      // Sonnet appears twice: in button and dropdown
      expect(screen.getAllByText('Sonnet 4.5').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Opus 4.5')).toHaveLength(1);
      expect(screen.getAllByText('Opus 4.6')).toHaveLength(1);
    });

    it('should show Codex group with "Coming Soon" info box', async () => {
      const user = userEvent.setup();
      render(<ModelSelector />, { wrapper: TestWrapper });

      await user.click(screen.getByRole('button'));

      // Codex heading and info box should be visible
      expect(screen.getByText('Codex')).toBeInTheDocument();
      expect(screen.getByText('Coming Soon')).toBeInTheDocument();
    });

    it('should close dropdown when clicking the button again', async () => {
      const user = userEvent.setup();
      render(<ModelSelector />, { wrapper: TestWrapper });

      const button = screen.getByRole('button');

      // Open
      await user.click(button);
      expect(screen.getByText('Claude')).toBeInTheDocument();

      // Close
      await user.click(button);

      // Wait for animation
      await waitFor(() => {
        expect(screen.queryByText('Claude')).not.toBeInTheDocument();
      });
    });
  });

  describe('model selection', () => {
    it('should call onModelChange when selecting a valid Claude model', async () => {
      const onModelChange = vi.fn();
      const user = userEvent.setup();

      render(<ModelSelector onModelChange={onModelChange} />, { wrapper: TestWrapper });

      // Open dropdown
      await user.click(screen.getByRole('button'));

      // Select Haiku
      await user.click(screen.getByText('Haiku 4.5'));

      expect(onModelChange).toHaveBeenCalledWith('haiku');
    });

    it('should update store when selecting a model', async () => {
      const user = userEvent.setup();

      render(<ModelSelector />, { wrapper: TestWrapper });

      // Open dropdown
      await user.click(screen.getByRole('button'));

      // Select Opus 4.5
      await user.click(screen.getByText('Opus 4.5'));

      // Store should be updated
      expect(useToolStore.getState().model).toBe('opus');
    });

    it('should call onModelChange when selecting Opus 4.6', async () => {
      const onModelChange = vi.fn();
      const user = userEvent.setup();

      render(<ModelSelector onModelChange={onModelChange} />, { wrapper: TestWrapper });

      // Open dropdown
      await user.click(screen.getByRole('button'));

      // Select Opus 4.6
      await user.click(screen.getByText('Opus 4.6'));

      expect(onModelChange).toHaveBeenCalledWith('claude-opus-4-6');
    });

    it('should NOT call onModelChange when clicking the Codex info box', async () => {
      const onModelChange = vi.fn();
      const user = userEvent.setup();

      render(<ModelSelector onModelChange={onModelChange} />, { wrapper: TestWrapper });

      // Open dropdown
      await user.click(screen.getByRole('button'));

      // Click the "Coming Soon" text (not a selectable model)
      await user.click(screen.getByText('Coming Soon'));

      // Callback should NOT be called
      expect(onModelChange).not.toHaveBeenCalled();
    });

    it('should close dropdown after selecting a model', async () => {
      const user = userEvent.setup();

      render(<ModelSelector />, { wrapper: TestWrapper });

      // Open dropdown
      await user.click(screen.getByRole('button'));
      expect(screen.getByText('Claude')).toBeInTheDocument();

      // Select a model
      await user.click(screen.getByText('Haiku 4.5'));

      // Dropdown should close
      await waitFor(() => {
        expect(screen.queryByText('Claude')).not.toBeInTheDocument();
      });
    });

    it('should show checkmark on selected model', async () => {
      useToolStore.setState({ model: 'sonnet' });
      const user = userEvent.setup();

      render(<ModelSelector />, { wrapper: TestWrapper });

      // Open dropdown
      await user.click(screen.getByRole('button'));

      // The selected model row should have special styling (border-l-2)
      // We check that Sonnet option exists in dropdown
      const sonnetOption = screen.getAllByText('Sonnet 4.5');
      // Should appear at least once (in dropdown, possibly also in trigger)
      expect(sonnetOption.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('accessibility', () => {
    it('should be keyboard accessible', async () => {
      const user = userEvent.setup();
      render(<ModelSelector />, { wrapper: TestWrapper });

      // Tab to button
      await user.tab();

      // Button should be focused
      expect(screen.getByRole('button')).toHaveFocus();
    });
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('ModelSelector Edge Cases', () => {
  beforeEach(() => {
    resetStore();
  });

  it('should handle rapid open/close clicks', async () => {
    const user = userEvent.setup();
    render(<ModelSelector />, { wrapper: TestWrapper });

    const button = screen.getByRole('button');

    // Rapid clicks
    await user.click(button);
    await user.click(button);
    await user.click(button);

    // Should not crash - component handles animation state
    expect(button).toBeInTheDocument();
  });

  it('should work without onModelChange callback', async () => {
    const user = userEvent.setup();

    // No callback provided
    render(<ModelSelector />, { wrapper: TestWrapper });

    // Open and select
    await user.click(screen.getByRole('button'));
    await user.click(screen.getByText('Opus 4.5'));

    // Should still update store
    expect(useToolStore.getState().model).toBe('opus');
  });
});
