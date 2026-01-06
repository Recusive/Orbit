/**
 * ModelSelector - Dropdown selector for AI model
 *
 * Features:
 * - Dropdown with Claude model options (Haiku, Sonnet, Opus)
 * - Click outside to close
 * - Styled to match orbit-agent
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { SiClaude } from 'react-icons/si';

const ChevronDownIcon = (): React.JSX.Element => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
);

const CheckIcon = (): React.JSX.Element => (
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
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

// Types
export type ModelId = 'haiku' | 'sonnet' | 'opus';

interface ModelOption {
  id: ModelId;
  name: string;
}

const models: ModelOption[] = [
  { id: 'haiku', name: 'Haiku 4.5' },
  { id: 'sonnet', name: 'Sonnet 4.5' },
  { id: 'opus', name: 'Opus 4.5' },
];

// Styles
const selectorStyles = `
	.model-button {
		transition: all 0.15s ease;
		opacity: 0.7;
	}
	.model-button:hover {
		background-color: var(--accent) !important;
		opacity: 1;
	}
	.model-button.open {
		background-color: var(--accent) !important;
		opacity: 1;
	}
	.model-dropdown {
		animation: model-dropdown-fade-in 0.15s ease-out;
	}
	@keyframes model-dropdown-fade-in {
		from { opacity: 0; transform: translateY(4px); }
		to { opacity: 1; transform: translateY(0); }
	}
	.model-option {
		transition: background-color 0.1s ease;
	}
	.model-option:hover {
		background-color: var(--accent) !important;
	}
`;

export interface ModelSelectorProps {
  value: ModelId;
  onChange: (model: ModelId) => void;
  disabled?: boolean;
}

export function ModelSelector({
  value,
  onChange,
  disabled = false,
}: ModelSelectorProps): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent): void => {
      if (
        dropdownRef.current !== null &&
        buttonRef.current !== null &&
        !dropdownRef.current.contains(e.target as Node) &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSelect = useCallback(
    (modelId: ModelId): void => {
      onChange(modelId);
      setIsOpen(false);
    },
    [onChange]
  );

  const selectedModel = models.find((m) => m.id === value);

  return (
    <>
      <style>{selectorStyles}</style>
      <div style={{ position: 'relative' }}>
        {/* Trigger Button */}
        <button
          ref={buttonRef}
          className={`model-button ${isOpen ? 'open' : ''}`}
          onClick={() => {
            setIsOpen(!isOpen);
          }}
          disabled={disabled}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            height: 24,
            padding: '0 8px',
            border: '1px solid var(--border)',
            borderRadius: 4,
            backgroundColor: 'transparent',
            color: 'var(--foreground)',
            fontSize: 11,
            fontWeight: 500,
            cursor: disabled ? 'not-allowed' : 'pointer',
            outline: 'none',
          }}
        >
          <SiClaude style={{ width: 12, height: 12 }} />
          <span>{selectedModel?.name ?? 'Model'}</span>
          <ChevronDownIcon />
        </button>

        {/* Dropdown */}
        {isOpen ? (
          <div
            ref={dropdownRef}
            className="model-dropdown"
            style={{
              position: 'absolute',
              bottom: '100%',
              left: 0,
              marginBottom: 4,
              minWidth: 140,
              backgroundColor: 'var(--popover)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
              overflow: 'hidden',
              zIndex: 50,
            }}
          >
            <div style={{ padding: 4 }}>
              {/* Header */}
              <div
                style={{
                  padding: '4px 8px',
                  fontSize: 10,
                  fontWeight: 500,
                  color: 'var(--muted-foreground)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Claude
              </div>

              {/* Options */}
              {models.map((model) => (
                <button
                  key={model.id}
                  className="model-option"
                  onClick={() => {
                    handleSelect(model.id);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '6px 8px',
                    marginTop: 2,
                    border: 'none',
                    borderRadius: 4,
                    backgroundColor: value === model.id ? 'var(--accent)' : 'transparent',
                    color: 'var(--foreground)',
                    fontSize: 11,
                    fontWeight: 400,
                    cursor: 'pointer',
                    outline: 'none',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <SiClaude style={{ width: 12, height: 12 }} />
                    <span>{model.name}</span>
                  </div>
                  {value === model.id && <CheckIcon />}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}

export default ModelSelector;
