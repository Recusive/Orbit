import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { InputControlsProps } from '@/components/chat/input/types';
import type { InputMode } from '@/types/protocol';
import type { ReactNode } from 'react';

import { InputControls } from '@/components/chat/input/InputControls';
import { INPUT_MODE_LABELS } from '@/components/chat/input/constants';
import { TooltipProvider } from '@/components/ui/tooltip';

function TestWrapper({ children }: { readonly children: ReactNode }): ReactNode {
  return <TooltipProvider>{children}</TooltipProvider>;
}

function createDefaultProps(overrides: Partial<InputControlsProps> = {}): InputControlsProps {
  return {
    inputMode: 'default',
    model: 'claude-sonnet-4-6',
    thinkingMode: 'off',
    effortLevel: 'high',
    isAgentRunning: false,
    isInputEmpty: true,
    usage: { inputTokens: 0, outputTokens: 0 },
    maxTokens: 200000,
    imageInputRef: { current: null },
    thinkingHoverOpen: false,
    setThinkingHoverOpen: vi.fn(),
    effortHoverOpen: false,
    setEffortHoverOpen: vi.fn(),
    onModelChange: vi.fn(),
    cycleInputMode: vi.fn(),
    cycleThinkingMode: vi.fn(),
    cycleEffortLevel: vi.fn(),
    handleImageClick: vi.fn(),
    handleImageSelect: vi.fn(),
    handleSend: vi.fn(),
    handleStop: vi.fn(),
    getThinkingInfo: () => ({ level: 'Off', tokens: '0' }),
    getEffortInfo: () => ({ level: 'High', description: 'Thorough analysis' }),
    getActiveDots: () => 0,
    ...overrides,
  };
}

function getModePickerButton(): HTMLElement {
  return screen.getByRole('button', { name: /Input mode:.*Click to change/i });
}

describe('INPUT_MODE_LABELS constant', () => {
  it('maps the three supported modes', () => {
    expect(INPUT_MODE_LABELS).toEqual({
      default: 'Default',
      plan: 'Plan',
      accept: 'Accept',
    });
  });
});

describe('InputControls mode picker', () => {
  it.each([
    ['default', 'Default'],
    ['plan', 'Plan'],
    ['accept', 'Accept'],
  ] satisfies readonly [InputMode, string][])(
    'renders %s mode with the expected label',
    (inputMode: InputMode, label: string) => {
      render(<InputControls {...createDefaultProps({ inputMode })} />, { wrapper: TestWrapper });

      expect(within(getModePickerButton()).getByText(label)).toBeInTheDocument();
    }
  );

  it('uses the expected aria-label', () => {
    render(<InputControls {...createDefaultProps({ inputMode: 'plan' })} />, {
      wrapper: TestWrapper,
    });

    expect(
      screen.getByRole('button', { name: 'Input mode: Plan. Click to change.' })
    ).toBeInTheDocument();
  });

  it('calls cycleInputMode when clicked', async () => {
    const cycleInputMode = vi.fn();
    const user = userEvent.setup();

    render(<InputControls {...createDefaultProps({ cycleInputMode })} />, { wrapper: TestWrapper });

    await user.click(getModePickerButton());

    expect(cycleInputMode).toHaveBeenCalledTimes(1);
  });

  it('applies plan styling when plan mode is active', () => {
    render(<InputControls {...createDefaultProps({ inputMode: 'plan' })} />, {
      wrapper: TestWrapper,
    });

    const button = getModePickerButton();
    expect(button).toHaveClass('bg-mode-plan/10');
    expect(button).toHaveClass('text-mode-plan');
  });
});

describe('InputControls image attachment button', () => {
  it('keeps the image button enabled for Claude', async () => {
    const handleImageClick = vi.fn();
    const user = userEvent.setup();

    render(<InputControls {...createDefaultProps({ handleImageClick })} />, {
      wrapper: TestWrapper,
    });

    const button = screen.getByRole('button', { name: 'Attach image' });
    expect(button).toBeEnabled();

    await user.click(button);

    expect(handleImageClick).toHaveBeenCalledTimes(1);
  });
});
