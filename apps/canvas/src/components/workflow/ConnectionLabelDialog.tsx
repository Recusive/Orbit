import React, { useState, useCallback, useEffect, useRef } from 'react';

import { radii, fontWeight, shadows, spacing } from '../../lib/designTokens';

// ============================================================================
// Common Labels
// ============================================================================

const COMMON_LABELS = [
  'leads to',
  'depends on',
  'relates to',
  'analyzed by',
  'implements',
  'extends',
  'documents',
  'refines',
];

// ============================================================================
// Icons
// ============================================================================

const CloseIcon = (): React.JSX.Element => (
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
  },
  quickLabelsSection: {
    marginTop: spacing.md,
  },
  quickLabelsTitle: {
    fontSize: 11,
    fontWeight: fontWeight.semibold,
    color: 'var(--muted-foreground)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: spacing.sm,
  },
  quickLabels: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 6,
  },
  quickLabelButton: {
    padding: '4px 10px',
    fontSize: 12,
    fontWeight: fontWeight.medium,
    color: 'var(--muted-foreground)',
    backgroundColor: 'var(--muted)',
    border: 'none',
    borderRadius: radii.pill,
    cursor: 'pointer',
    transition: 'all 0.1s',
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
};

// ============================================================================
// Props
// ============================================================================

interface ConnectionLabelDialogProps {
  onConfirm: (label: string) => void;
  onCancel: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function ConnectionLabelDialog({
  onConfirm,
  onCancel,
}: ConnectionLabelDialogProps): React.JSX.Element {
  const [label, setLabel] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [closeHovered, setCloseHovered] = useState(false);
  const [cancelHovered, setCancelHovered] = useState(false);
  const [confirmHovered, setConfirmHovered] = useState(false);

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
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onCancel]);

  // Handle label change
  const handleLabelChange = useCallback((e: React.ChangeEvent<HTMLInputElement>): void => {
    setLabel(e.target.value);
  }, []);

  // Handle quick label click
  const handleQuickLabelClick = useCallback((quickLabel: string): void => {
    setLabel(quickLabel);
    inputRef.current?.focus();
  }, []);

  // Handle confirm
  const handleConfirm = useCallback((): void => {
    onConfirm(label.trim() || 'connects to');
  }, [label, onConfirm]);

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
          <span style={styles.headerTitle}>New Connection</span>
          <button
            style={{
              ...styles.closeButton,
              ...(closeHovered
                ? { backgroundColor: 'var(--accent)', color: 'var(--foreground)' }
                : {}),
            }}
            onClick={onCancel}
            onMouseEnter={() => {
              setCloseHovered(true);
            }}
            onMouseLeave={() => {
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
              <label style={styles.label}>Connection Label</label>
              <input
                ref={inputRef}
                style={styles.input}
                type="text"
                value={label}
                onChange={handleLabelChange}
                placeholder="e.g., leads to, depends on, relates to"
              />
            </div>

            {/* Quick Labels */}
            <div style={styles.quickLabelsSection}>
              <div style={styles.quickLabelsTitle}>Quick Labels</div>
              <div style={styles.quickLabels}>
                {COMMON_LABELS.map((quickLabel) => (
                  <button
                    key={quickLabel}
                    type="button"
                    style={{
                      ...styles.quickLabelButton,
                      ...(label === quickLabel
                        ? {
                            backgroundColor: 'var(--primary)',
                            color: 'var(--primary-foreground)',
                          }
                        : {}),
                    }}
                    onClick={() => {
                      handleQuickLabelClick(quickLabel);
                    }}
                  >
                    {quickLabel}
                  </button>
                ))}
              </div>
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
              onMouseEnter={() => {
                setCancelHovered(true);
              }}
              onMouseLeave={() => {
                setCancelHovered(false);
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                ...styles.button,
                ...styles.confirmButton,
                ...(confirmHovered ? { opacity: 0.9 } : {}),
              }}
              onMouseEnter={() => {
                setConfirmHovered(true);
              }}
              onMouseLeave={() => {
                setConfirmHovered(false);
              }}
            >
              Create Connection
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
