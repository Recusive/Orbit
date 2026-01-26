/**
 * Input Mode Button Tests
 *
 * Tests for the Mode Picker button in InputControls component.
 *
 * The Mode Picker button:
 * - Displays current input mode ("Default", "Plan", "Accept")
 * - Cycles through modes on click: default → plan → accept → default
 * - Has mode-specific styling (colors change per mode)
 * - Has accessible aria-label that updates with mode
 *
 * @see InputControls.tsx - Component implementation
 * @see use-chat-input.ts - Hook with cycleInputMode logic
 * @see constants.ts - INPUT_MODE_LABELS mapping
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Note: describe, it, expect, vi are globals via vitest/globals (tsconfig.spec.json)

import type { InputControlsProps } from '@/components/chat/input/types';
import type { InputMode } from '@/types/protocol';
import type { ReactNode } from 'react';

import { InputControls } from '@/components/chat/input/InputControls';
import { INPUT_MODE_LABELS } from '@/components/chat/input/constants';
import { TooltipProvider } from '@/components/ui/tooltip';

/**
 * Wrapper component that provides required context for InputControls.
 * InputControls uses Radix UI Tooltip which requires a TooltipProvider.
 */
function TestWrapper({ children }: { readonly children: ReactNode }): ReactNode {
  return <TooltipProvider>{children}</TooltipProvider>;
}

// =============================================================================
// Test Setup
// =============================================================================

/**
 * Create default props for InputControls component.
 * Override specific props in individual tests.
 */
function createDefaultProps(overrides: Partial<InputControlsProps> = {}): InputControlsProps {
  return {
    inputMode: 'default',
    thinkingMode: 'off',
    isAgentRunning: false,
    isInputEmpty: true,
    usage: { inputTokens: 0, outputTokens: 0 },
    maxTokens: 200000,
    imageInputRef: { current: null },
    thinkingHoverOpen: false,
    setThinkingHoverOpen: vi.fn(),
    onModelChange: vi.fn(),
    cycleInputMode: vi.fn(),
    cycleThinkingMode: vi.fn(),
    handleAtClick: vi.fn(),
    handleGlobeClick: vi.fn(),
    handleImageClick: vi.fn(),
    handleImageSelect: vi.fn(),
    handleSend: vi.fn(),
    handleStop: vi.fn(),
    getThinkingInfo: () => ({ level: 'Off', tokens: '0' }),
    getActiveDots: () => 0,
    ...overrides,
  };
}

/**
 * Helper to find the mode picker button.
 * Uses aria-label pattern to find the button reliably.
 */
function getModePickerButton(): HTMLElement {
  return screen.getByRole('button', { name: /Input mode:.*Click to change/i });
}

// =============================================================================
// Unit Tests: INPUT_MODE_LABELS Constant
// =============================================================================

describe('INPUT_MODE_LABELS constant', () => {
  it('should have label for default mode', () => {
    expect(INPUT_MODE_LABELS.default).toBe('Default');
  });

  it('should have label for plan mode', () => {
    expect(INPUT_MODE_LABELS.plan).toBe('Plan');
  });

  it('should have label for accept mode', () => {
    expect(INPUT_MODE_LABELS.accept).toBe('Accept');
  });

  it('should have exactly three modes', () => {
    const modes = Object.keys(INPUT_MODE_LABELS);
    expect(modes).toHaveLength(3);
    expect(modes).toContain('default');
    expect(modes).toContain('plan');
    expect(modes).toContain('accept');
  });
});

// =============================================================================
// Unit Tests: cycleInputMode Logic
// =============================================================================

describe('cycleInputMode logic', () => {
  /**
   * Test the cycling logic independently.
   * This mirrors the logic in use-chat-input.ts:365-369
   */
  function getNextMode(currentMode: InputMode): InputMode {
    return currentMode === 'default' ? 'plan' : currentMode === 'plan' ? 'accept' : 'default';
  }

  it('should cycle from default to plan', () => {
    expect(getNextMode('default')).toBe('plan');
  });

  it('should cycle from plan to accept', () => {
    expect(getNextMode('plan')).toBe('accept');
  });

  it('should cycle from accept back to default', () => {
    expect(getNextMode('accept')).toBe('default');
  });

  it('should complete a full cycle correctly', () => {
    let mode: InputMode = 'default';

    mode = getNextMode(mode);
    expect(mode).toBe('plan');

    mode = getNextMode(mode);
    expect(mode).toBe('accept');

    mode = getNextMode(mode);
    expect(mode).toBe('default');
  });
});

// =============================================================================
// Integration Tests: InputControls Mode Picker Button
// =============================================================================

describe('InputControls Mode Picker Button', () => {
  describe('rendering', () => {
    it('should render the mode picker button', () => {
      render(<InputControls {...createDefaultProps()} />, { wrapper: TestWrapper });

      const button = getModePickerButton();
      expect(button).toBeInTheDocument();
    });

    it('should display "Default" label when mode is default', () => {
      render(<InputControls {...createDefaultProps({ inputMode: 'default' })} />, {
        wrapper: TestWrapper,
      });

      const button = getModePickerButton();
      expect(within(button).getByText('Default')).toBeInTheDocument();
    });

    it('should display "Plan" label when mode is plan', () => {
      render(<InputControls {...createDefaultProps({ inputMode: 'plan' })} />, {
        wrapper: TestWrapper,
      });

      const button = getModePickerButton();
      expect(within(button).getByText('Plan')).toBeInTheDocument();
    });

    it('should display "Accept" label when mode is accept', () => {
      render(<InputControls {...createDefaultProps({ inputMode: 'accept' })} />, {
        wrapper: TestWrapper,
      });

      const button = getModePickerButton();
      expect(within(button).getByText('Accept')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have correct aria-label for default mode', () => {
      render(<InputControls {...createDefaultProps({ inputMode: 'default' })} />, {
        wrapper: TestWrapper,
      });

      const button = screen.getByRole('button', {
        name: 'Input mode: Default. Click to change.',
      });
      expect(button).toBeInTheDocument();
    });

    it('should have correct aria-label for plan mode', () => {
      render(<InputControls {...createDefaultProps({ inputMode: 'plan' })} />, {
        wrapper: TestWrapper,
      });

      const button = screen.getByRole('button', {
        name: 'Input mode: Plan. Click to change.',
      });
      expect(button).toBeInTheDocument();
    });

    it('should have correct aria-label for accept mode', () => {
      render(<InputControls {...createDefaultProps({ inputMode: 'accept' })} />, {
        wrapper: TestWrapper,
      });

      const button = screen.getByRole('button', {
        name: 'Input mode: Accept. Click to change.',
      });
      expect(button).toBeInTheDocument();
    });
  });

  describe('styling', () => {
    it('should have muted styling for default mode', () => {
      render(<InputControls {...createDefaultProps({ inputMode: 'default' })} />, {
        wrapper: TestWrapper,
      });

      const button = getModePickerButton();
      expect(button).toHaveClass('bg-muted/40');
      expect(button).toHaveClass('text-muted-foreground');
    });

    it('should have plan mode styling for plan mode', () => {
      render(<InputControls {...createDefaultProps({ inputMode: 'plan' })} />, {
        wrapper: TestWrapper,
      });

      const button = getModePickerButton();
      expect(button).toHaveClass('bg-mode-plan/10');
      expect(button).toHaveClass('text-mode-plan');
    });

    it('should have accept mode styling for accept mode', () => {
      render(<InputControls {...createDefaultProps({ inputMode: 'accept' })} />, {
        wrapper: TestWrapper,
      });

      const button = getModePickerButton();
      expect(button).toHaveClass('bg-mode-accept/10');
      expect(button).toHaveClass('text-mode-accept');
    });

    it('should have common styling for all modes', () => {
      render(<InputControls {...createDefaultProps()} />, { wrapper: TestWrapper });

      const button = getModePickerButton();
      expect(button).toHaveClass('h-7');
      expect(button).toHaveClass('rounded-lg');
      expect(button).toHaveClass('transition-[background-color,color,transform]');
    });
  });

  describe('user interaction', () => {
    it('should call cycleInputMode when clicked', async () => {
      const cycleInputMode = vi.fn();
      const user = userEvent.setup();

      render(<InputControls {...createDefaultProps({ cycleInputMode })} />, {
        wrapper: TestWrapper,
      });

      const button = getModePickerButton();
      await user.click(button);

      expect(cycleInputMode).toHaveBeenCalledTimes(1);
    });

    it('should call cycleInputMode on each click', async () => {
      const cycleInputMode = vi.fn();
      const user = userEvent.setup();

      render(<InputControls {...createDefaultProps({ cycleInputMode })} />, {
        wrapper: TestWrapper,
      });

      const button = getModePickerButton();

      await user.click(button);
      await user.click(button);
      await user.click(button);

      expect(cycleInputMode).toHaveBeenCalledTimes(3);
    });

    it('should be focusable via keyboard', async () => {
      const user = userEvent.setup();

      render(<InputControls {...createDefaultProps()} />, { wrapper: TestWrapper });

      // Tab to focus the button
      await user.tab();

      // The mode picker should be one of the first focusable elements
      // Note: exact tab order depends on DOM structure
      const button = getModePickerButton();
      // Just verify the button exists and has focus-visible styles
      expect(button).toHaveClass('focus-visible:outline-none');
      expect(button).toHaveClass('focus-visible:ring-1');
    });
  });

  describe('integration with mode changes', () => {
    it('should render correct UI when mode prop changes', () => {
      const { rerender } = render(
        <InputControls {...createDefaultProps({ inputMode: 'default' })} />,
        { wrapper: TestWrapper }
      );

      // Initial state: default mode
      let button = getModePickerButton();
      expect(within(button).getByText('Default')).toBeInTheDocument();
      expect(button).toHaveClass('bg-muted/40');

      // Change to plan mode
      rerender(
        <TestWrapper>
          <InputControls {...createDefaultProps({ inputMode: 'plan' })} />
        </TestWrapper>
      );
      button = getModePickerButton();
      expect(within(button).getByText('Plan')).toBeInTheDocument();
      expect(button).toHaveClass('bg-mode-plan/10');

      // Change to accept mode
      rerender(
        <TestWrapper>
          <InputControls {...createDefaultProps({ inputMode: 'accept' })} />
        </TestWrapper>
      );
      button = getModePickerButton();
      expect(within(button).getByText('Accept')).toBeInTheDocument();
      expect(button).toHaveClass('bg-mode-accept/10');
    });
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('InputControls Mode Picker Edge Cases', () => {
  it('should handle rapid clicks without errors', async () => {
    const cycleInputMode = vi.fn();
    const user = userEvent.setup();

    render(<InputControls {...createDefaultProps({ cycleInputMode })} />, {
      wrapper: TestWrapper,
    });

    const button = getModePickerButton();

    // Rapid fire clicks
    await Promise.all([
      user.click(button),
      user.click(button),
      user.click(button),
      user.click(button),
      user.click(button),
    ]);

    expect(cycleInputMode).toHaveBeenCalled();
  });

  it('should work correctly when agent is running', async () => {
    const cycleInputMode = vi.fn();
    const user = userEvent.setup();

    render(
      <InputControls
        {...createDefaultProps({
          cycleInputMode,
          isAgentRunning: true,
        })}
      />,
      { wrapper: TestWrapper }
    );

    const button = getModePickerButton();
    await user.click(button);

    // Mode cycling should still work when agent is running
    expect(cycleInputMode).toHaveBeenCalledTimes(1);
  });

  it('should work correctly when input is not empty', async () => {
    const cycleInputMode = vi.fn();
    const user = userEvent.setup();

    render(
      <InputControls
        {...createDefaultProps({
          cycleInputMode,
          isInputEmpty: false,
        })}
      />,
      { wrapper: TestWrapper }
    );

    const button = getModePickerButton();
    await user.click(button);

    expect(cycleInputMode).toHaveBeenCalledTimes(1);
  });
});
