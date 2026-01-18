/**
 * AddCardDialog - Modal dialog for creating new workflow cards
 * Supports card name, type selection, and optional template
 */

import { IconAgent } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconAgent';
import { IconBrainSideview } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconBrainSideview';
import { IconCodeBrackets } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconCodeBrackets';
import { IconInputForm } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconInputForm';
import { IconListSparkle } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconListSparkle';
import { IconMarkdown } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconMarkdown';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import type { CardType } from '../../types/workflowTypes';

// ============================================================================
// Types
// ============================================================================

interface AddCardDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateCard: (name: string, type: CardType, content: string) => void;
  /** Optional position for the new card (e.g., from right-click) */
  position?: { x: number; y: number };
}

interface CardTypeOption {
  type: CardType;
  label: string;
  icon: React.ReactNode;
  description: string;
  defaultContent: string;
}

// ============================================================================
// Constants
// ============================================================================

const CARD_TYPES: CardTypeOption[] = [
  {
    type: 'prompt',
    label: 'Prompt',
    icon: <IconInputForm size={18} />,
    description: 'User input or question',
    defaultContent: '# Prompt\n\nEnter your prompt here...',
  },
  {
    type: 'response',
    label: 'Response',
    icon: <IconListSparkle size={18} />,
    description: 'AI or system response',
    defaultContent: '# Response\n\nResponse content...',
  },
  {
    type: 'decision',
    label: 'Decision',
    icon: <IconBrainSideview size={18} />,
    description: 'Branching logic or choice',
    defaultContent: '# Decision\n\n## Condition\n\n## If True\n\n## If False',
  },
  {
    type: 'diagram',
    label: 'Diagram',
    icon: <IconAgent size={18} />,
    description: 'Visual diagram or chart',
    defaultContent: '# Diagram\n\n```mermaid\ngraph TD\n    A[Start] --> B[End]\n```',
  },
  {
    type: 'code-snippet',
    label: 'Code',
    icon: <IconCodeBrackets size={18} />,
    description: 'Code snippet or example',
    defaultContent: '# Code Snippet\n\n```typescript\n// Your code here\n```',
  },
  {
    type: 'document',
    label: 'Document',
    icon: <IconMarkdown size={18} />,
    description: 'Markdown document or notes',
    defaultContent: '# Document\n\nWrite your notes here...',
  },
];

// ============================================================================
// Component
// ============================================================================

export function AddCardDialog({
  isOpen,
  onClose,
  onCreateCard,
}: AddCardDialogProps): React.JSX.Element | null {
  const [name, setName] = useState('');
  const [selectedType, setSelectedType] = useState<CardType>('prompt');
  const nameInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Handle create - defined before useEffect that references it
  const handleCreate = useCallback((): void => {
    const trimmedName = name.trim();
    if (trimmedName === '') return;

    const cardTypeOption = CARD_TYPES.find((t) => t.type === selectedType);
    const content = cardTypeOption?.defaultContent ?? '# New Card\n\nStart writing...';

    onCreateCard(trimmedName, selectedType, content);
    onClose();
  }, [name, selectedType, onCreateCard, onClose]);

  // Auto-focus name input when dialog opens
  useEffect(() => {
    if (isOpen) {
      setName('');
      setSelectedType('prompt');
      // Delay focus slightly for DOM to be ready
      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent): void => {
      // Escape to close
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      // Enter to create (when name is not empty)
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleCreate();
        return;
      }

      // Number keys 1-6 to select card type
      const typeIndex = parseInt(e.key, 10) - 1;
      const cardType = CARD_TYPES[typeIndex];
      if (typeIndex >= 0 && typeIndex < CARD_TYPES.length && cardType !== undefined) {
        setSelectedType(cardType.type);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleCreate, onClose]);

  // Handle backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent): void => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  if (!isOpen) return null;

  return (
    <div
      className="add-card-dialog-backdrop"
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        ref={dialogRef}
        className="add-card-dialog"
        style={{
          backgroundColor: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: 16,
          width: 320,
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 14,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--foreground)',
            }}
          >
            New Card
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--muted-foreground)',
              cursor: 'pointer',
              padding: 2,
              fontSize: 16,
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 20,
              height: 20,
              borderRadius: 4,
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Name Input */}
        <div style={{ marginBottom: 14 }}>
          <label
            htmlFor="card-name"
            style={{
              display: 'block',
              marginBottom: 6,
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--muted-foreground)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Name
          </label>
          <input
            ref={nameInputRef}
            id="card-name"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
            placeholder="Enter card name..."
            style={{
              width: '100%',
              padding: '8px 10px',
              backgroundColor: 'var(--input)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              fontSize: 13,
              color: 'var(--foreground)',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Type Selection - 3x2 Grid */}
        <div style={{ marginBottom: 14 }}>
          <label
            style={{
              display: 'block',
              marginBottom: 6,
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--muted-foreground)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Type
          </label>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 6,
            }}
          >
            {CARD_TYPES.map((cardType, index) => {
              const isSelected = selectedType === cardType.type;
              return (
                <button
                  key={cardType.type}
                  onClick={() => {
                    setSelectedType(cardType.type);
                  }}
                  title={`${cardType.description} (${String(index + 1)})`}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 3,
                    padding: '8px 4px',
                    backgroundColor: isSelected ? 'var(--primary)' : 'var(--muted)',
                    border: isSelected ? '1px solid var(--primary)' : '1px solid transparent',
                    borderRadius: 6,
                    cursor: 'pointer',
                    color: isSelected ? 'var(--primary-foreground)' : 'var(--foreground)',
                    transition: 'all 0.12s ease',
                    position: 'relative',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {cardType.icon}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 500 }}>{cardType.label}</span>
                  <span
                    style={{
                      position: 'absolute',
                      top: 3,
                      right: 5,
                      fontSize: 9,
                      opacity: 0.5,
                      fontWeight: 400,
                    }}
                  >
                    {index + 1}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer Actions */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            marginTop: 16,
          }}
        >
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: '8px 12px',
              backgroundColor: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 6,
              fontSize: 12,
              color: 'var(--foreground)',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={name.trim() === ''}
            style={{
              flex: 1,
              padding: '8px 12px',
              backgroundColor: name.trim() !== '' ? 'var(--primary)' : 'var(--muted)',
              border: 'none',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 500,
              color: name.trim() !== '' ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
              cursor: name.trim() !== '' ? 'pointer' : 'not-allowed',
            }}
          >
            Create
          </button>
        </div>

        {/* Keyboard Hint - Compact */}
        <div
          style={{
            marginTop: 10,
            textAlign: 'center',
            fontSize: 10,
            color: 'var(--muted-foreground)',
            opacity: 0.7,
          }}
        >
          <kbd
            style={{
              padding: '1px 4px',
              backgroundColor: 'var(--muted)',
              borderRadius: 3,
              fontSize: 9,
            }}
          >
            Enter
          </kbd>{' '}
          create ·{' '}
          <kbd
            style={{
              padding: '1px 4px',
              backgroundColor: 'var(--muted)',
              borderRadius: 3,
              fontSize: 9,
            }}
          >
            Esc
          </kbd>{' '}
          cancel
        </div>
      </div>
    </div>
  );
}
