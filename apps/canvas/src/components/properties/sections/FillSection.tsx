/**
 * FillSection
 *
 * Fill properties section containing:
 * - Multi-fill list with add/remove/reorder
 * - Color picker for solid fills
 * - Gradient editor for gradient fills
 * - Image options (future)
 */

import React, { useState, useCallback } from 'react';

import { spacing, radii, fontSize, motion } from '../../../lib/design/designTokens';
import { ColorInput } from '../inputs/ColorInput';
import { GradientEditor } from '../inputs/GradientEditor';
import { NumberInput } from '../inputs/NumberInput';
import { AddRemoveControls, VisibilityToggle } from '../shared/AddRemoveControls';
import { CollapsibleSection } from '../shared/CollapsibleSection';

import type { Fill, FillType, GradientStop } from '../../../types/designNodeTypes';

export interface FillSectionProps {
  fills: Fill[];
  onFillsChange: (fills: Fill[]) => void;
  disabled?: boolean;
}

// Icons
const FillIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor" opacity="0.3" />
  </svg>
);

const SolidFillIcon = (): React.JSX.Element => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor" />
  </svg>
);

const GradientFillIcon = (): React.JSX.Element => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <defs>
      <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="currentColor" stopOpacity="0.2" />
        <stop offset="100%" stopColor="currentColor" stopOpacity="1" />
      </linearGradient>
    </defs>
    <rect x="4" y="4" width="16" height="16" rx="2" fill="url(#grad)" />
  </svg>
);

const ImageFillIcon = (): React.JSX.Element => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <circle cx="9" cy="9" r="2" fill="currentColor" opacity="0.5" />
    <path d="M20 16l-5-5-9 9" strokeLinecap="round" />
  </svg>
);

const ChevronDownIcon = (): React.JSX.Element => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const styles = {
  content: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.md,
  },
  fillItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: 'var(--muted)',
    borderRadius: radii.md,
    border: '1px solid var(--border)',
  },
  fillHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
  },
  fillTypeButton: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.xs,
    padding: `${String(spacing.xs)}px ${String(spacing.sm)}px`,
    border: '1px solid var(--border)',
    borderRadius: radii.sm,
    backgroundColor: 'var(--background)',
    color: 'var(--foreground)',
    fontSize: fontSize.xs,
    cursor: 'pointer',
    transition: `all ${motion.fast} ${motion.ease}`,
  },
  fillControls: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    marginLeft: 'auto',
  },
  opacityInput: {
    width: 60,
  },
  typeDropdown: {
    position: 'absolute' as const,
    top: '100%',
    left: 0,
    marginTop: spacing.xs,
    padding: spacing.xs,
    backgroundColor: 'var(--popover)',
    border: '1px solid var(--border)',
    borderRadius: radii.md,
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    zIndex: 100,
    minWidth: 120,
  },
  typeOption: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    padding: `${String(spacing.sm)}px ${String(spacing.md)}px`,
    borderRadius: radii.sm,
    cursor: 'pointer',
    fontSize: fontSize.sm,
    color: 'var(--foreground)',
    transition: `background-color ${motion.fast} ${motion.ease}`,
  },
  colorRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
  },
  emptyState: {
    padding: spacing.lg,
    textAlign: 'center' as const,
    fontSize: fontSize.sm,
    color: 'var(--muted-foreground)',
  },
};

const defaultFill: Fill = {
  type: 'solid',
  color: '#CCCCCC',
  opacity: 1,
};

const defaultGradientStops: GradientStop[] = [
  { position: 0, color: '#FFFFFF' },
  { position: 1, color: '#000000' },
];

export function FillSection({
  fills,
  onFillsChange,
  disabled = false,
}: FillSectionProps): React.JSX.Element {
  const [typeDropdownIndex, setTypeDropdownIndex] = useState<number | null>(null);
  const [hiddenFills, setHiddenFills] = useState<Set<number>>(new Set());

  // Add new fill
  const handleAddFill = useCallback(() => {
    onFillsChange([...fills, { ...defaultFill }]);
  }, [fills, onFillsChange]);

  // Remove fill
  const handleRemoveFill = useCallback(
    (index: number) => {
      onFillsChange(fills.filter((_, i) => i !== index));
      setHiddenFills((prev) => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    },
    [fills, onFillsChange]
  );

  // Toggle fill visibility (local state only, for preview)
  const handleToggleVisibility = useCallback((index: number) => {
    setHiddenFills((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  // Update fill
  const updateFill = useCallback(
    (index: number, updates: Partial<Fill>) => {
      const newFills = fills.map((f, i) => (i === index ? { ...f, ...updates } : f));
      onFillsChange(newFills);
    },
    [fills, onFillsChange]
  );

  // Change fill type
  const handleTypeChange = useCallback(
    (index: number, type: FillType) => {
      const updates: Partial<Fill> = { type };

      if (type === 'gradient') {
        updates.gradientType = 'linear';
        updates.gradientAngle = 90;
        updates.gradientStops = [...defaultGradientStops];
      }

      updateFill(index, updates);
      setTypeDropdownIndex(null);
    },
    [updateFill]
  );

  // Get fill type icon
  const getFillTypeIcon = (type: FillType): React.JSX.Element => {
    switch (type) {
      case 'solid':
        return <SolidFillIcon />;
      case 'gradient':
        return <GradientFillIcon />;
      case 'image':
        return <ImageFillIcon />;
    }
  };

  // Get fill type label
  const getFillTypeLabel = (type: FillType): string => {
    switch (type) {
      case 'solid':
        return 'Solid';
      case 'gradient':
        return 'Gradient';
      case 'image':
        return 'Image';
    }
  };

  // Preview for collapsed state
  const previewContent =
    fills.length > 0 ? (
      <div style={{ display: 'flex', gap: 4 }}>
        {fills.slice(0, 3).map((fill, i) => (
          <div
            key={i}
            style={{
              width: 14,
              height: 14,
              borderRadius: radii.sm,
              border: '1px solid var(--border)',
              backgroundColor: fill.type === 'solid' ? fill.color : 'var(--muted)',
              background:
                fill.type === 'gradient' && fill.gradientStops
                  ? `linear-gradient(${String(fill.gradientAngle ?? 90)}deg, ${fill.gradientStops.map((s) => s.color).join(', ')})`
                  : undefined,
            }}
          />
        ))}
        {fills.length > 3 ? (
          <span style={{ fontSize: fontSize.xs, color: 'var(--muted-foreground)' }}>
            +{fills.length - 3}
          </span>
        ) : null}
      </div>
    ) : undefined;

  return (
    <CollapsibleSection
      title="Fill"
      sectionId="fill"
      icon={<FillIcon />}
      defaultOpen={false}
      showAddButton
      onAdd={handleAddFill}
      preview={previewContent}
    >
      <div style={styles.content}>
        {fills.length === 0 ? (
          <div style={styles.emptyState}>No fills. Click + to add one.</div>
        ) : (
          fills.map((fill, index) => (
            <div key={index} style={styles.fillItem}>
              {/* Fill header with type selector */}
              <div style={styles.fillHeader}>
                {/* Type dropdown trigger */}
                <div style={{ position: 'relative' }}>
                  <button
                    style={styles.fillTypeButton}
                    onClick={() => {
                      setTypeDropdownIndex(typeDropdownIndex === index ? null : index);
                    }}
                    disabled={disabled}
                  >
                    {getFillTypeIcon(fill.type)}
                    <span>{getFillTypeLabel(fill.type)}</span>
                    <ChevronDownIcon />
                  </button>

                  {/* Type dropdown */}
                  {typeDropdownIndex === index ? (
                    <div style={styles.typeDropdown}>
                      {(['solid', 'gradient', 'image'] as FillType[]).map((type) => (
                        <div
                          key={type}
                          style={{
                            ...styles.typeOption,
                            backgroundColor: fill.type === type ? 'var(--accent)' : 'transparent',
                          }}
                          onClick={() => {
                            handleTypeChange(index, type);
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'var(--accent)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor =
                              fill.type === type ? 'var(--accent)' : 'transparent';
                          }}
                        >
                          {getFillTypeIcon(type)}
                          <span>{getFillTypeLabel(type)}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>

                {/* Controls */}
                <div style={styles.fillControls}>
                  <div style={styles.opacityInput}>
                    <NumberInput
                      value={Math.round((fill.opacity ?? 1) * 100)}
                      onChange={(val) => {
                        updateFill(index, { opacity: val / 100 });
                      }}
                      min={0}
                      max={100}
                      unit="%"
                      disabled={disabled}
                    />
                  </div>
                  <VisibilityToggle
                    visible={!hiddenFills.has(index)}
                    onChange={() => {
                      handleToggleVisibility(index);
                    }}
                    disabled={disabled}
                  />
                  <AddRemoveControls
                    onRemove={() => {
                      handleRemoveFill(index);
                    }}
                    canRemove={!disabled}
                  />
                </div>
              </div>

              {/* Fill content based on type */}
              {fill.type === 'solid' ? (
                <div style={styles.colorRow}>
                  <ColorInput
                    color={fill.color ?? '#CCCCCC'}
                    onColorChange={(color: string) => {
                      updateFill(index, { color });
                    }}
                    disabled={disabled}
                  />
                </div>
              ) : fill.type === 'gradient' ? (
                <GradientEditor
                  type={fill.gradientType ?? 'linear'}
                  angle={fill.gradientAngle ?? 90}
                  stops={fill.gradientStops ?? defaultGradientStops}
                  onTypeChange={(gradientType) => {
                    updateFill(index, { gradientType });
                  }}
                  onAngleChange={(gradientAngle) => {
                    updateFill(index, { gradientAngle });
                  }}
                  onStopsChange={(gradientStops) => {
                    updateFill(index, { gradientStops });
                  }}
                  disabled={disabled}
                />
              ) : (
                // Image fills
                <div style={styles.emptyState}>Image fills coming soon</div>
              )}
            </div>
          ))
        )}
      </div>
    </CollapsibleSection>
  );
}

export default FillSection;
