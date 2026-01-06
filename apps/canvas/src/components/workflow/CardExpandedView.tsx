import { IconAgent } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconAgent';
import { IconBrainSideview } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconBrainSideview';
import { IconCodeBrackets } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconCodeBrackets';
import { IconInputForm } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconInputForm';
import { IconListSparkle } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconListSparkle';
import { IconMarkdown } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconMarkdown';
import React, { useCallback, useState, useEffect } from 'react';

import { fontWeight } from '../../lib/designTokens';

import type { MarkdownCard, CardType } from '../../types/workflowTypes';

// ============================================================================
// Constants
// ============================================================================

const EASE_OUT = 'cubic-bezier(0.4, 0, 0.2, 1)';
const EASE_SMOOTH = 'cubic-bezier(0.16, 1, 0.3, 1)';

// Animation durations
const MODAL_ENTER_DURATION = 250;
const MODAL_EXIT_DURATION = 200;
const BACKDROP_ENTER_DURATION = 200;
const BACKDROP_EXIT_DURATION = 150;

// ============================================================================
// Card Type Icons (using central-icons - same as MarkdownCardNode)
// ============================================================================

const PromptIcon = (): React.JSX.Element => <IconInputForm size={18} />;
const ResponseIcon = (): React.JSX.Element => <IconListSparkle size={18} />;
const DecisionIcon = (): React.JSX.Element => <IconBrainSideview size={18} />;
const DiagramIcon = (): React.JSX.Element => <IconAgent size={18} />;
const CodeSnippetIcon = (): React.JSX.Element => <IconCodeBrackets size={18} />;
const DocumentIcon = (): React.JSX.Element => <IconMarkdown size={18} />;

const CARD_TYPE_ICONS: Record<CardType, () => React.JSX.Element> = {
  prompt: PromptIcon,
  response: ResponseIcon,
  decision: DecisionIcon,
  diagram: DiagramIcon,
  'code-snippet': CodeSnippetIcon,
  document: DocumentIcon,
};

// Colors matching MarkdownCardNode.css
const CARD_TYPE_COLORS: Record<CardType, { accent: string; bg: string }> = {
  prompt: {
    accent: '#9665FF',
    bg: 'rgba(150, 101, 255, 0.12)',
  },
  response: {
    accent: '#22c55e',
    bg: 'rgba(34, 197, 94, 0.12)',
  },
  decision: {
    accent: '#FFAE2B',
    bg: 'rgba(255, 174, 43, 0.12)',
  },
  diagram: {
    accent: '#a855f7',
    bg: 'rgba(168, 85, 247, 0.12)',
  },
  'code-snippet': {
    accent: '#6b7280',
    bg: 'rgba(107, 114, 128, 0.12)',
  },
  document: {
    accent: '#14b8a6',
    bg: 'rgba(20, 184, 166, 0.12)',
  },
};

// ============================================================================
// Styles
// ============================================================================

const styles = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    backdropFilter: 'blur(4px)',
  },
  modal: {
    width: '90vw',
    maxWidth: 720,
    maxHeight: '85vh',
    backgroundColor: 'var(--card)',
    borderRadius: 16,
    border: 'none',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 12px 24px -8px rgba(0, 0, 0, 0.15)',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '16px 20px',
    backgroundColor: 'color-mix(in oklch, var(--muted) 30%, transparent)',
    borderBottom: 'none',
  },
  typeIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    borderRadius: 10,
    flexShrink: 0,
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: fontWeight.semibold,
    color: 'var(--foreground)',
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  closeButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    padding: 0,
    border: 'none',
    borderRadius: 8,
    backgroundColor: 'transparent',
    color: 'var(--muted-foreground)',
    cursor: 'pointer',
    transition: `all 200ms ${EASE_OUT}`,
  },
  closeButtonHover: {
    backgroundColor: 'color-mix(in oklch, var(--muted) 60%, transparent)',
    color: 'var(--foreground)',
    transform: 'scale(1.05)',
  },
  closeButtonActive: {
    transform: 'scale(0.95)',
  },
  content: {
    flex: 1,
    padding: 20,
    overflow: 'auto',
  },
  textarea: {
    width: '100%',
    height: '100%',
    minHeight: 300,
    padding: 16,
    border: '1px solid color-mix(in oklch, var(--border) 40%, transparent)',
    borderRadius: 12,
    backgroundColor: 'color-mix(in oklch, var(--background) 80%, transparent)',
    color: 'var(--foreground)',
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace',
    fontSize: 13,
    lineHeight: 1.6,
    resize: 'none' as const,
    outline: 'none',
    transition: `all 200ms ${EASE_OUT}`,
    boxShadow: 'none',
  },
  textareaFocus: {
    border: '1px solid var(--primary)',
    boxShadow: '0 0 0 3px color-mix(in oklch, var(--primary) 20%, transparent)',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    padding: '14px 20px',
    backgroundColor: 'color-mix(in oklch, var(--muted) 20%, transparent)',
    borderTop: 'none',
  },
  secondaryButton: {
    height: 34,
    padding: '0 14px',
    border: '1px solid var(--border)',
    borderRadius: 10,
    backgroundColor: 'transparent',
    color: 'var(--foreground)',
    fontSize: 13,
    fontWeight: fontWeight.medium,
    cursor: 'pointer',
    transition: `all 200ms ${EASE_OUT}`,
  },
  secondaryButtonHover: {
    backgroundColor: 'color-mix(in oklch, var(--muted) 60%, transparent)',
    transform: 'scale(1.02)',
  },
  secondaryButtonActive: {
    transform: 'scale(0.97)',
  },
  primaryButton: {
    height: 34,
    padding: '0 16px',
    border: 'none',
    borderRadius: 10,
    backgroundColor: 'var(--primary)',
    color: 'var(--primary-foreground)',
    fontSize: 13,
    fontWeight: fontWeight.medium,
    cursor: 'pointer',
    transition: `all 200ms ${EASE_OUT}`,
  },
  primaryButtonHover: {
    filter: 'brightness(1.1)',
    boxShadow: '0 0 16px -2px var(--primary)',
    transform: 'scale(1.02)',
  },
  primaryButtonActive: {
    transform: 'scale(0.97)',
  },
  primaryButtonDisabled: {
    backgroundColor: 'var(--muted)',
    color: 'var(--muted-foreground)',
    cursor: 'not-allowed',
    opacity: 0.6,
  },
};

// ============================================================================
// CardExpandedView Component
// ============================================================================

interface CardExpandedViewProps {
  card: MarkdownCard;
  onClose: () => void;
  onUpdate?: (cardId: string, updates: Partial<MarkdownCard>) => void;
}

export function CardExpandedView({
  card,
  onClose,
  onUpdate,
}: CardExpandedViewProps): React.JSX.Element | null {
  const [editContent, setEditContent] = useState(card.content);
  const [isTextareaFocused, setIsTextareaFocused] = useState(false);
  const [closeHovered, setCloseHovered] = useState(false);
  const [closePressed, setClosePressed] = useState(false);
  const [cancelHovered, setCancelHovered] = useState(false);
  const [cancelPressed, setCancelPressed] = useState(false);
  const [saveHovered, setSaveHovered] = useState(false);
  const [savePressed, setSavePressed] = useState(false);

  // Animation state for exit animation
  const [isClosing, setIsClosing] = useState(false);
  const [shouldRender, setShouldRender] = useState(true);

  const cardType = card.type;
  const TypeIcon = CARD_TYPE_ICONS[cardType];
  const colors = CARD_TYPE_COLORS[cardType];

  // Handle close with exit animation
  const handleClose = useCallback((): void => {
    if (isClosing) return; // Prevent double-close

    setIsClosing(true);

    // Wait for exit animation to complete before unmounting
    setTimeout(() => {
      setShouldRender(false);
      setIsClosing(false);
      onClose();
    }, MODAL_EXIT_DURATION);
  }, [isClosing, onClose]);

  // Handle save with exit animation
  const handleSave = useCallback((): void => {
    if (isClosing) return;

    onUpdate?.(card.id, { content: editContent });

    setIsClosing(true);
    setTimeout(() => {
      setShouldRender(false);
      setIsClosing(false);
      onClose();
    }, MODAL_EXIT_DURATION);
  }, [card.id, editContent, onUpdate, onClose, isClosing]);

  // Handle escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !isClosing) {
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleClose, isClosing]);

  // Handle overlay click
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent): void => {
      if (e.target === e.currentTarget && !isClosing) {
        handleClose();
      }
    },
    [handleClose, isClosing]
  );

  // Handle content change
  const handleContentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    setEditContent(e.target.value);
  }, []);

  // Don't render if unmounted
  if (!shouldRender) return null;

  // Check if content has changed
  const hasChanges = editContent !== card.content;

  // Build dynamic styles
  const closeButtonStyles: React.CSSProperties = {
    ...styles.closeButton,
    ...(closeHovered ? styles.closeButtonHover : {}),
    ...(closePressed ? styles.closeButtonActive : {}),
  };

  const textareaStyles: React.CSSProperties = {
    ...styles.textarea,
    ...(isTextareaFocused ? styles.textareaFocus : {}),
  };

  const cancelButtonStyles: React.CSSProperties = {
    ...styles.secondaryButton,
    ...(cancelHovered ? styles.secondaryButtonHover : {}),
    ...(cancelPressed ? styles.secondaryButtonActive : {}),
  };

  const saveButtonStyles: React.CSSProperties = {
    ...styles.primaryButton,
    ...(hasChanges ? {} : styles.primaryButtonDisabled),
    ...(hasChanges && saveHovered ? styles.primaryButtonHover : {}),
    ...(hasChanges && savePressed ? styles.primaryButtonActive : {}),
  };

  // Animation strings based on state
  const backdropAnimation = isClosing
    ? `backdropExit ${String(BACKDROP_EXIT_DURATION)}ms ease-out forwards`
    : `backdropEnter ${String(BACKDROP_ENTER_DURATION)}ms ease-out forwards`;

  const modalAnimation = isClosing
    ? `modalExit ${String(MODAL_EXIT_DURATION)}ms ${EASE_OUT} forwards`
    : `modalEnter ${String(MODAL_ENTER_DURATION)}ms ${EASE_SMOOTH} forwards`;

  return (
    <>
      {/* Animation keyframes */}
      <style>
        {`
					/* Entry animations */
					@keyframes backdropEnter {
						from { opacity: 0; }
						to { opacity: 1; }
					}
					@keyframes modalEnter {
						from {
							opacity: 0;
							transform: scale(0.95) translateY(12px);
						}
						to {
							opacity: 1;
							transform: scale(1) translateY(0);
						}
					}

					/* Exit animations */
					@keyframes backdropExit {
						from { opacity: 1; }
						to { opacity: 0; }
					}
					@keyframes modalExit {
						from {
							opacity: 1;
							transform: scale(1) translateY(0);
						}
						to {
							opacity: 0;
							transform: scale(0.95) translateY(8px);
						}
					}

					/* Reduced motion accessibility */
					@media (prefers-reduced-motion: reduce) {
						.card-expanded-overlay,
						.card-expanded-modal {
							animation-duration: 100ms !important;
						}
						@keyframes modalEnter {
							from { opacity: 0; }
							to { opacity: 1; }
						}
						@keyframes modalExit {
							from { opacity: 1; }
							to { opacity: 0; }
						}
					}
				`}
      </style>
      <div
        className="card-expanded-overlay"
        data-state={isClosing ? 'closing' : 'open'}
        style={{
          ...styles.overlay,
          animation: backdropAnimation,
        }}
        onClick={handleOverlayClick}
      >
        <div
          className="card-expanded-modal"
          data-state={isClosing ? 'closing' : 'open'}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          style={{
            ...styles.modal,
            animation: modalAnimation,
          }}
        >
          {/* Header */}
          <div style={styles.header}>
            {/* Type icon with accent background */}
            <div
              style={{
                ...styles.typeIcon,
                backgroundColor: colors.bg,
                color: colors.accent,
              }}
            >
              <TypeIcon />
            </div>

            {/* Title */}
            <h2 id="modal-title" style={styles.title}>
              {card.name}
            </h2>

            {/* Close button */}
            <button
              onClick={handleClose}
              style={closeButtonStyles}
              onMouseEnter={(): void => {
                setCloseHovered(true);
              }}
              onMouseLeave={(): void => {
                setCloseHovered(false);
                setClosePressed(false);
              }}
              onMouseDown={(): void => {
                setClosePressed(true);
              }}
              onMouseUp={(): void => {
                setClosePressed(false);
              }}
              title="Close (Esc)"
            >
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
            </button>
          </div>

          {/* Editor area */}
          <div style={styles.content}>
            <textarea
              value={editContent}
              onChange={handleContentChange}
              autoFocus
              placeholder="Enter markdown content..."
              style={textareaStyles}
              onFocus={(): void => {
                setIsTextareaFocused(true);
              }}
              onBlur={(): void => {
                setIsTextareaFocused(false);
              }}
            />
          </div>

          {/* Footer */}
          <div style={styles.footer}>
            <button
              onClick={handleClose}
              style={cancelButtonStyles}
              onMouseEnter={(): void => {
                setCancelHovered(true);
              }}
              onMouseLeave={(): void => {
                setCancelHovered(false);
                setCancelPressed(false);
              }}
              onMouseDown={(): void => {
                setCancelPressed(true);
              }}
              onMouseUp={(): void => {
                setCancelPressed(false);
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges}
              style={saveButtonStyles}
              onMouseEnter={(): void => {
                setSaveHovered(true);
              }}
              onMouseLeave={(): void => {
                setSaveHovered(false);
                setSavePressed(false);
              }}
              onMouseDown={(): void => {
                setSavePressed(true);
              }}
              onMouseUp={(): void => {
                setSavePressed(false);
              }}
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
