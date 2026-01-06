import React, { useCallback, useEffect, useRef, useState } from 'react';

import { fontWeight, radii, shadows, spacing } from '../../lib/designTokens';

// ============================================================================
// Icons
// ============================================================================

function CloseIcon(): React.JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = {
  overlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
  },
  dialog: {
    backgroundColor: 'var(--card)',
    borderRadius: radii.lg,
    border: '1px solid var(--border)',
    boxShadow: shadows.xl,
    width: 360,
    maxWidth: '90vw',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottom: '1px solid var(--border)',
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: fontWeight.semibold,
    color: 'var(--foreground)',
  },
  closeButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    padding: 0,
    border: 'none',
    borderRadius: radii.sm,
    backgroundColor: 'transparent',
    color: 'var(--muted-foreground)',
    cursor: 'pointer',
    transition: 'all 0.1s',
  },
  content: {
    padding: spacing.md,
  },
  inputGroup: {
    marginBottom: spacing.md,
  },
  label: {
    display: 'block',
    fontSize: 12,
    fontWeight: fontWeight.medium,
    color: 'var(--muted-foreground)',
    marginBottom: 4,
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    fontSize: 14,
    color: 'var(--foreground)',
    backgroundColor: 'var(--background)',
    border: '1px solid var(--border)',
    borderRadius: radii.md,
    outline: 'none',
    transition: 'border-color 0.15s',
    boxSizing: 'border-box' as const,
  },
  inputError: {
    borderColor: 'var(--destructive)',
  },
  errorText: {
    fontSize: 12,
    color: 'var(--destructive)',
    marginTop: 4,
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    padding: spacing.md,
    borderTop: '1px solid var(--border)',
  },
  button: {
    padding: '8px 16px',
    fontSize: 13,
    fontWeight: fontWeight.medium,
    borderRadius: radii.md,
    cursor: 'pointer',
    transition: 'all 0.15s',
    border: 'none',
  },
  cancelButton: {
    color: 'var(--muted-foreground)',
    backgroundColor: 'transparent',
  },
  confirmButton: {
    color: 'var(--primary-foreground)',
    backgroundColor: 'var(--primary)',
  },
  confirmButtonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
};

// ============================================================================
// Props
// ============================================================================

interface NewWorkflowDialogProps {
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function NewWorkflowDialog({
  onConfirm,
  onCancel,
}: NewWorkflowDialogProps): React.JSX.Element {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [closeHovered, setCloseHovered] = useState(false);
  const [cancelHovered, setCancelHovered] = useState(false);
  const [confirmHovered, setConfirmHovered] = useState(false);

  const isValid = name.trim().length > 0;

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return (): void => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onCancel]);

  // Handle name change
  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      setName(e.target.value);
      if (error !== null) {
        setError(null);
      }
    },
    [error]
  );

  // Handle confirm
  const handleConfirm = useCallback((): void => {
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      setError('Please enter a workflow name');
      inputRef.current?.focus();
      return;
    }
    onConfirm(trimmedName);
  }, [name, onConfirm]);

  // Handle form submit
  const handleSubmit = useCallback(
    (e: React.FormEvent): void => {
      e.preventDefault();
      handleConfirm();
    },
    [handleConfirm]
  );

  // Handle overlay click
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent): void => {
      if (e.target === e.currentTarget) {
        onCancel();
      }
    },
    [onCancel]
  );

  return (
    <div style={styles.overlay} onClick={handleOverlayClick}>
      <div style={styles.dialog}>
        {/* Header */}
        <div style={styles.header}>
          <span style={styles.headerTitle}>New Workflow</span>
          <button
            style={{
              ...styles.closeButton,
              ...(closeHovered
                ? { backgroundColor: 'var(--accent)', color: 'var(--foreground)' }
                : {}),
            }}
            onClick={onCancel}
            onMouseEnter={(): void => {
              setCloseHovered(true);
            }}
            onMouseLeave={(): void => {
              setCloseHovered(false);
            }}
            title="Cancel (Escape)"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit}>
          <div style={styles.content}>
            <div style={styles.inputGroup}>
              <label style={styles.label}>Workflow Name</label>
              <input
                ref={inputRef}
                style={{
                  ...styles.input,
                  ...(error !== null ? styles.inputError : {}),
                }}
                type="text"
                value={name}
                onChange={handleNameChange}
                placeholder="e.g., Authentication Flow, API Design"
              />
              {error !== null && <div style={styles.errorText}>{error}</div>}
            </div>
          </div>

          {/* Footer */}
          <div style={styles.footer}>
            <button
              type="button"
              style={{
                ...styles.button,
                ...styles.cancelButton,
                ...(cancelHovered ? { backgroundColor: 'var(--accent)' } : {}),
              }}
              onClick={onCancel}
              onMouseEnter={(): void => {
                setCancelHovered(true);
              }}
              onMouseLeave={(): void => {
                setCancelHovered(false);
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid}
              style={{
                ...styles.button,
                ...styles.confirmButton,
                ...(!isValid ? styles.confirmButtonDisabled : {}),
                ...(confirmHovered && isValid ? { opacity: 0.9 } : {}),
              }}
              onMouseEnter={(): void => {
                setConfirmHovered(true);
              }}
              onMouseLeave={(): void => {
                setConfirmHovered(false);
              }}
            >
              Create Workflow
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
