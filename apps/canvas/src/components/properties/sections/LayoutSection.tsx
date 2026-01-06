/**
 * LayoutSection
 *
 * Layout properties section containing:
 * - Width/Height with aspect ratio lock
 * - Clip content toggle
 * - Auto-layout controls (for frames)
 */

import React, { useState, useCallback } from 'react';

import { spacing, radii, fontSize, fontWeight, motion } from '../../../lib/design/designTokens';
import { NumberInput } from '../inputs/NumberInput';
import { CollapsibleSection } from '../shared/CollapsibleSection';
import { IconButton, IconButtonGroup } from '../shared/IconButton';
import { PropertyRow, InputWrapper } from '../shared/PropertyRow';

import type { AutoLayout } from '../../../types/designNodeTypes';

export interface LayoutSectionProps {
  width: number;
  height: number;
  clipContent?: boolean;
  autoLayout?: AutoLayout;
  onWidthChange: (width: number) => void;
  onHeightChange: (height: number) => void;
  onClipContentChange?: (clip: boolean) => void;
  onEnableAutoLayout?: (direction: 'horizontal' | 'vertical') => void;
  onDisableAutoLayout?: () => void;
  onUpdateAutoLayout?: (updates: Partial<AutoLayout>) => void;
  /** Whether this is a frame (shows auto-layout options) */
  isFrame?: boolean;
  disabled?: boolean;
}

// Icons
const LayoutIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="3" y1="9" x2="21" y2="9" opacity="0.5" />
    <line x1="9" y1="21" x2="9" y2="9" opacity="0.5" />
  </svg>
);

const LinkIcon = (): React.JSX.Element => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

const UnlinkIcon = (): React.JSX.Element => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" opacity="0.5" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" opacity="0.5" />
    <line x1="2" y1="2" x2="22" y2="22" />
  </svg>
);

const FlowHorizontalIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="8" width="5" height="8" rx="1" fill="currentColor" opacity="0.3" />
    <rect x="10" y="8" width="5" height="8" rx="1" fill="currentColor" opacity="0.3" />
    <rect x="17" y="8" width="4" height="8" rx="1" fill="currentColor" opacity="0.3" />
  </svg>
);

const FlowVerticalIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="8" y="3" width="8" height="5" rx="1" fill="currentColor" opacity="0.3" />
    <rect x="8" y="10" width="8" height="5" rx="1" fill="currentColor" opacity="0.3" />
    <rect x="8" y="17" width="8" height="4" rx="1" fill="currentColor" opacity="0.3" />
  </svg>
);

const FlowWrapIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="5" height="5" rx="1" fill="currentColor" opacity="0.3" />
    <rect x="10" y="3" width="5" height="5" rx="1" fill="currentColor" opacity="0.3" />
    <rect x="17" y="3" width="4" height="5" rx="1" fill="currentColor" opacity="0.3" />
    <rect x="3" y="10" width="5" height="5" rx="1" fill="currentColor" opacity="0.3" />
    <rect x="10" y="10" width="5" height="5" rx="1" fill="currentColor" opacity="0.3" />
  </svg>
);

const FlowGridIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="7" height="7" rx="1" fill="currentColor" opacity="0.3" />
    <rect x="14" y="3" width="7" height="7" rx="1" fill="currentColor" opacity="0.3" />
    <rect x="3" y="14" width="7" height="7" rx="1" fill="currentColor" opacity="0.3" />
    <rect x="14" y="14" width="7" height="7" rx="1" fill="currentColor" opacity="0.3" />
  </svg>
);

const styles = {
  content: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.md,
  },
  flowRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  flowLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: 'var(--muted-foreground)',
    minWidth: 32,
  },
  dimensionsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
  },
  aspectLockButton: {
    flexShrink: 0,
  },
  clipRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
  },
  checkbox: {
    width: 16,
    height: 16,
    accentColor: 'var(--primary)',
    cursor: 'pointer',
  },
  checkboxLabel: {
    fontSize: fontSize.sm,
    color: 'var(--foreground)',
    cursor: 'pointer',
    userSelect: 'none' as const,
  },
  autoLayoutSection: {
    padding: spacing.md,
    backgroundColor: 'var(--muted)',
    borderRadius: radii.md,
    border: '1px solid var(--border)',
  },
  autoLayoutHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  autoLayoutTitle: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: 'var(--foreground)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  autoLayoutToggle: {
    padding: `${String(spacing.xs)}px ${String(spacing.md)}px`,
    border: '1px solid var(--border)',
    borderRadius: radii.sm,
    backgroundColor: 'var(--background)',
    color: 'var(--foreground)',
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    cursor: 'pointer',
    transition: `all ${motion.fast} ${motion.ease}`,
  },
  spacingRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
  },
};

export function LayoutSection({
  width,
  height,
  clipContent = false,
  autoLayout,
  onWidthChange,
  onHeightChange,
  onClipContentChange,
  onEnableAutoLayout,
  onDisableAutoLayout,
  onUpdateAutoLayout,
  isFrame = false,
  disabled = false,
}: LayoutSectionProps): React.JSX.Element {
  const [aspectLocked, setAspectLocked] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(width / height);

  // Handle width change with aspect ratio
  const handleWidthChange = useCallback(
    (newWidth: number) => {
      onWidthChange(newWidth);
      if (aspectLocked && aspectRatio > 0) {
        onHeightChange(Math.round(newWidth / aspectRatio));
      }
    },
    [onWidthChange, onHeightChange, aspectLocked, aspectRatio]
  );

  // Handle height change with aspect ratio
  const handleHeightChange = useCallback(
    (newHeight: number) => {
      onHeightChange(newHeight);
      if (aspectLocked && aspectRatio > 0) {
        onWidthChange(Math.round(newHeight * aspectRatio));
      }
    },
    [onWidthChange, onHeightChange, aspectLocked, aspectRatio]
  );

  // Toggle aspect lock
  const handleToggleAspectLock = useCallback(() => {
    if (!aspectLocked) {
      // Lock: capture current ratio
      setAspectRatio(width / height);
    }
    setAspectLocked(!aspectLocked);
  }, [aspectLocked, width, height]);

  // Handle clip content toggle
  const handleClipContentChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (onClipContentChange) {
        onClipContentChange(e.target.checked);
      }
    },
    [onClipContentChange]
  );

  // Handle auto-layout direction change
  const handleFlowChange = useCallback(
    (direction: 'horizontal' | 'vertical' | 'wrap' | 'grid' | 'none') => {
      if (direction === 'none') {
        if (onDisableAutoLayout) {
          onDisableAutoLayout();
        }
      } else if (direction === 'horizontal' || direction === 'vertical') {
        if (autoLayout) {
          if (onUpdateAutoLayout) {
            onUpdateAutoLayout({ direction });
          }
        } else if (onEnableAutoLayout) {
          onEnableAutoLayout(direction);
        }
      }
      // wrap and grid are future features
    },
    [autoLayout, onEnableAutoLayout, onDisableAutoLayout, onUpdateAutoLayout]
  );

  // Preview text for collapsed state
  const previewText = `${String(Math.round(width))} × ${String(Math.round(height))}`;

  return (
    <CollapsibleSection
      title="Layout"
      sectionId="layout"
      icon={<LayoutIcon />}
      defaultOpen={false}
      preview={
        <span style={{ fontSize: fontSize.xs, color: 'var(--muted-foreground)' }}>
          {previewText}
        </span>
      }
    >
      <div style={styles.content}>
        {/* Flow direction (for frames with auto-layout support) */}
        {isFrame && onEnableAutoLayout ? (
          <div style={styles.flowRow}>
            <span style={styles.flowLabel}>Flow</span>
            <IconButtonGroup>
              <IconButton
                icon={<FlowHorizontalIcon />}
                onClick={() => {
                  handleFlowChange('horizontal');
                }}
                isActive={autoLayout?.direction === 'horizontal'}
                disabled={disabled}
                title="Horizontal layout"
                size="sm"
              />
              <IconButton
                icon={<FlowVerticalIcon />}
                onClick={() => {
                  handleFlowChange('vertical');
                }}
                isActive={autoLayout?.direction === 'vertical'}
                disabled={disabled}
                title="Vertical layout"
                size="sm"
              />
              <IconButton
                icon={<FlowWrapIcon />}
                onClick={() => {
                  handleFlowChange('wrap');
                }}
                isActive={false}
                disabled={true} // Future feature
                title="Wrap layout (coming soon)"
                size="sm"
              />
              <IconButton
                icon={<FlowGridIcon />}
                onClick={() => {
                  handleFlowChange('grid');
                }}
                isActive={false}
                disabled={true} // Future feature
                title="Grid layout (coming soon)"
                size="sm"
              />
            </IconButtonGroup>
          </div>
        ) : null}

        {/* Width/Height with aspect lock */}
        <div style={styles.dimensionsRow}>
          <PropertyRow inline gap="sm" marginBottom="none">
            <InputWrapper label="W">
              <NumberInput value={width} onChange={handleWidthChange} min={1} disabled={disabled} />
            </InputWrapper>
            <InputWrapper label="H">
              <NumberInput
                value={height}
                onChange={handleHeightChange}
                min={1}
                disabled={disabled}
              />
            </InputWrapper>
          </PropertyRow>
          <div style={styles.aspectLockButton}>
            <IconButton
              icon={aspectLocked ? <LinkIcon /> : <UnlinkIcon />}
              onClick={handleToggleAspectLock}
              isActive={aspectLocked}
              disabled={disabled}
              title={aspectLocked ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
              size="md"
            />
          </div>
        </div>

        {/* Clip content (for frames) */}
        {isFrame && onClipContentChange ? (
          <label style={styles.clipRow}>
            <input
              type="checkbox"
              checked={clipContent}
              onChange={handleClipContentChange}
              disabled={disabled}
              style={styles.checkbox}
            />
            <span style={styles.checkboxLabel}>Clip content</span>
          </label>
        ) : null}

        {/* Auto-layout spacing (when enabled) */}
        {autoLayout && onUpdateAutoLayout ? (
          <div style={styles.autoLayoutSection}>
            <div style={styles.autoLayoutHeader}>
              <span style={styles.autoLayoutTitle}>Auto Layout</span>
              <button
                style={styles.autoLayoutToggle}
                onClick={() => {
                  if (onDisableAutoLayout) onDisableAutoLayout();
                }}
                disabled={disabled}
              >
                Remove
              </button>
            </div>
            <div style={styles.spacingRow}>
              <InputWrapper label="Gap">
                <NumberInput
                  value={autoLayout.spacing}
                  onChange={(spacing) => {
                    onUpdateAutoLayout({ spacing });
                  }}
                  min={0}
                  disabled={disabled}
                />
              </InputWrapper>
              <InputWrapper label="Pad">
                <NumberInput
                  value={autoLayout.padding.top}
                  onChange={(top) => {
                    onUpdateAutoLayout({
                      padding: { ...autoLayout.padding, top, right: top, bottom: top, left: top },
                    });
                  }}
                  min={0}
                  disabled={disabled}
                />
              </InputWrapper>
            </div>
          </div>
        ) : null}
      </div>
    </CollapsibleSection>
  );
}

export default LayoutSection;
