/**
 * CollapsibleSection
 *
 * Collapsible section with:
 * - Expand/collapse toggle
 * - Optional [+] button for adding items
 * - Preview content when collapsed
 * - Smooth animation with reduced motion support
 * - Optional localStorage persistence via sectionId
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';

import { spacing, radii, fontSize, fontWeight, motion } from '../../../lib/design/designTokens';
import { useSectionState } from '../hooks/useSectionState';

export interface CollapsibleSectionProps {
  title: string;
  /** Unique ID for persisting section state to localStorage */
  sectionId?: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  isOpen?: boolean;
  onToggle?: (isOpen: boolean) => void;
  /** Show [+] button instead of chevron when collapsed and empty */
  showAddButton?: boolean;
  onAdd?: () => void;
  /** Preview content shown when collapsed (e.g., color swatch) */
  preview?: React.ReactNode;
  /** Right-side actions (visibility toggle, etc.) */
  actions?: React.ReactNode;
  children: React.ReactNode;
}

const ChevronIcon = ({ isOpen }: { isOpen: boolean }): React.JSX.Element => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    style={{
      transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
      transition: `transform ${motion.fast} ${motion.ease}`,
    }}
  >
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const AddIcon = (): React.JSX.Element => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
  >
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const styles = {
  container: {
    borderBottom: '1px solid var(--border)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    padding: `${String(spacing.md)}px ${String(spacing.xl)}px`,
    cursor: 'pointer',
    userSelect: 'none' as const,
    transition: `background-color ${motion.fast} ${motion.ease}`,
  },
  headerHover: {
    backgroundColor: 'var(--accent)',
  },
  iconContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 16,
    height: 16,
    color: 'var(--muted-foreground)',
    flexShrink: 0,
  },
  title: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: 'var(--foreground)',
  },
  preview: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    marginRight: spacing.sm,
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.xs,
  },
  addButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 20,
    height: 20,
    border: 'none',
    borderRadius: radii.sm,
    backgroundColor: 'transparent',
    color: 'var(--muted-foreground)',
    cursor: 'pointer',
    transition: `all ${motion.fast} ${motion.ease}`,
  },
  addButtonHover: {
    backgroundColor: 'var(--accent)',
    color: 'var(--foreground)',
  },
  chevron: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--muted-foreground)',
  },
  contentWrapper: {
    overflow: 'hidden',
    transition: `height ${motion.smooth} ${motion.ease}`,
  },
  content: {
    padding: `0 ${String(spacing.xl)}px ${String(spacing.lg)}px`,
  },
};

export function CollapsibleSection({
  title,
  sectionId,
  icon,
  defaultOpen = false,
  isOpen: controlledIsOpen,
  onToggle,
  showAddButton = false,
  onAdd,
  preview,
  actions,
  children,
}: CollapsibleSectionProps): React.JSX.Element {
  // Use persisted state if sectionId is provided, otherwise use local state
  const [persistedIsOpen, persistedToggle] = useSectionState(sectionId ?? '', defaultOpen);
  const [localIsOpen, setLocalIsOpen] = useState(defaultOpen);

  const [isHovered, setIsHovered] = useState(false);
  const [addButtonHovered, setAddButtonHovered] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState<number | 'auto'>('auto');
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  // Determine the actual open state: controlled > persisted > local
  const isOpen = controlledIsOpen ?? (sectionId ? persistedIsOpen : localIsOpen);

  // Check for reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent): void => {
      setPrefersReducedMotion(e.matches);
    };
    mediaQuery.addEventListener('change', handler);
    return () => {
      mediaQuery.removeEventListener('change', handler);
    };
  }, []);

  // Measure content height for animation
  useEffect(() => {
    if (contentRef.current) {
      const height = contentRef.current.scrollHeight;
      setContentHeight(height);
    }
  }, [children, isOpen]);

  const handleToggle = useCallback(() => {
    const newIsOpen = !isOpen;
    if (onToggle) {
      onToggle(newIsOpen);
    } else if (sectionId) {
      persistedToggle();
    } else {
      setLocalIsOpen(newIsOpen);
    }
  }, [isOpen, onToggle, sectionId, persistedToggle]);

  const handleAddClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (onAdd) {
        onAdd();
        // Also open the section when adding
        if (!isOpen) {
          handleToggle();
        }
      }
    },
    [onAdd, isOpen, handleToggle]
  );

  const handleActionsClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <div style={styles.container}>
      <div
        style={{
          ...styles.header,
          ...(isHovered ? styles.headerHover : {}),
        }}
        onClick={handleToggle}
        onMouseEnter={() => {
          setIsHovered(true);
        }}
        onMouseLeave={() => {
          setIsHovered(false);
        }}
      >
        {/* Chevron or Add button */}
        <span style={styles.chevron}>
          {showAddButton && !isOpen ? (
            <button
              style={{
                ...styles.addButton,
                ...(addButtonHovered ? styles.addButtonHover : {}),
              }}
              onClick={handleAddClick}
              onMouseEnter={() => {
                setAddButtonHovered(true);
              }}
              onMouseLeave={() => {
                setAddButtonHovered(false);
              }}
              title={`Add ${title.toLowerCase()}`}
            >
              <AddIcon />
            </button>
          ) : (
            <ChevronIcon isOpen={isOpen} />
          )}
        </span>

        {/* Optional icon */}
        {icon !== undefined ? <span style={styles.iconContainer}>{icon}</span> : null}

        {/* Title */}
        <span style={styles.title}>{title}</span>

        {/* Preview when collapsed */}
        {!isOpen && preview !== undefined ? <span style={styles.preview}>{preview}</span> : null}

        {/* Right-side actions */}
        {actions !== undefined ? (
          <span style={styles.actions} onClick={handleActionsClick}>
            {actions}
          </span>
        ) : null}
      </div>

      {/* Collapsible content */}
      <div
        style={{
          ...styles.contentWrapper,
          height: isOpen ? contentHeight : 0,
          transition: prefersReducedMotion ? 'none' : styles.contentWrapper.transition,
        }}
      >
        <div ref={contentRef} style={styles.content}>
          {children}
        </div>
      </div>
    </div>
  );
}

export default CollapsibleSection;
