/**
 * ChatInput - Input field for the chat panel
 *
 * Features:
 * - Auto-resizing textarea using InputGroup
 * - Enter to send, Shift+Enter for new line
 * - Mode selector (Default, Accept, Plan)
 * - Model selector (Haiku, Sonnet, Opus)
 * - Full clipboard support (Cmd+C, Cmd+V, etc. work natively)
 */

import React, { useCallback, useState } from 'react';

import {
  InputGroup,
  InputGroupTextarea,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupSeparator,
} from '../ui/InputGroup';

import { ModelSelector } from './ModelSelector';

import type { ModelId } from './ModelSelector';

// Icons
const PlusIcon = (): React.JSX.Element => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 5l0 14" />
    <path d="M5 12l14 0" />
  </svg>
);

const SendIcon = (): React.JSX.Element => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m5 12 7-7 7 7" />
    <path d="M12 19V5" />
  </svg>
);

// Mode types
type AgentMode = 'default' | 'plan' | 'accept';

const modeLabels: Record<AgentMode, string> = {
  default: 'Default',
  plan: 'Plan',
  accept: 'Accept',
};

const modeOrder: AgentMode[] = ['default', 'plan', 'accept'];

// Mode colors (same saturation/lightness for consistency)
const modeColors: Record<AgentMode, { border: string; text: string }> = {
  default: { border: 'var(--border)', text: 'var(--foreground)' },
  plan: { border: 'hsl(140, 35%, 45%)', text: 'hsl(140, 35%, 45%)' }, // Green
  accept: { border: 'hsl(280, 35%, 55%)', text: 'hsl(280, 35%, 55%)' }, // Purple
};

// Styles
const inputStyles = `
	.mode-button {
		transition: all 0.15s ease;
		opacity: 0.7;
	}
	.mode-button:hover {
		background-color: var(--accent) !important;
		opacity: 1;
	}
`;

export interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading?: boolean;
  placeholder?: string;
  disabled?: boolean;
}

export function ChatInput({
  onSend,
  isLoading = false,
  placeholder = 'Ask, Search or Chat...',
  disabled = false,
}: ChatInputProps): React.JSX.Element {
  const [value, setValue] = useState('');
  const [mode, setMode] = useState<AgentMode>('default');
  const [model, setModel] = useState<ModelId>('sonnet');

  const handleSend = useCallback((): void => {
    const trimmed = value.trim();
    if (trimmed.length > 0 && !isLoading && !disabled) {
      onSend(trimmed);
      setValue('');
    }
  }, [value, onSend, isLoading, disabled]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
      // Enter to send (without Shift)
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const cycleMode = useCallback((): void => {
    const currentIndex = modeOrder.indexOf(mode);
    const nextIndex = (currentIndex + 1) % modeOrder.length;
    const nextMode = modeOrder[nextIndex];
    if (nextMode !== undefined) {
      setMode(nextMode);
    }
  }, [mode]);

  const canSend = value.trim().length > 0 && !isLoading && !disabled;

  const modeStyle = modeColors[mode];
  const isSpecialMode = mode !== 'default';

  return (
    <div style={{ padding: '12px 16px 16px' }}>
      <style>{inputStyles}</style>
      <InputGroup
        style={{
          borderWidth: isSpecialMode ? 2 : 1,
          borderStyle: isSpecialMode ? 'dashed' : 'solid',
          borderColor: modeStyle.border,
        }}
      >
        <InputGroupTextarea
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || isLoading}
        />
        <InputGroupAddon align="block-end">
          <InputGroupButton variant="outline" size="icon-xs" title="Add context">
            <PlusIcon />
          </InputGroupButton>
          <button
            className="mode-button"
            onClick={cycleMode}
            style={{
              display: 'flex',
              alignItems: 'center',
              height: 24,
              padding: '0 8px',
              border: '1px solid var(--border)',
              borderRadius: 4,
              backgroundColor: 'transparent',
              color: modeStyle.text,
              fontSize: 11,
              fontWeight: 500,
              cursor: 'pointer',
              outline: 'none',
            }}
            title="Click to change mode"
          >
            {modeLabels[mode]}
          </button>
          <ModelSelector value={model} onChange={setModel} disabled={disabled || isLoading} />
          <InputGroupText style={{ marginLeft: 'auto' }}>Ready</InputGroupText>
          <InputGroupSeparator />
          <InputGroupButton
            variant="default"
            size="icon-xs"
            onClick={handleSend}
            disabled={!canSend}
            title="Send"
          >
            <SendIcon />
            <span className="sr-only">Send</span>
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}
