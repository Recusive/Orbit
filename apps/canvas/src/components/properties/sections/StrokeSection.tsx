/**
 * StrokeSection
 *
 * Stroke properties section containing:
 * - Multi-stroke list with add/remove
 * - Color picker
 * - Width input
 * - Style selector (solid, dashed, dotted)
 * - Position selector (inside, center, outside)
 */

import React, { useState, useCallback } from 'react';

import { spacing, radii, fontSize, fontWeight } from '../../../lib/designTokens';
import { ColorInput } from '../inputs/ColorInput';
import { NumberInput } from '../inputs/NumberInput';
import { AddRemoveControls, VisibilityToggle } from '../shared/AddRemoveControls';
import { CollapsibleSection } from '../shared/CollapsibleSection';
import { IconButton, IconButtonGroup } from '../shared/IconButton';

import type { Stroke } from '../../../types/designNodeTypes';

export interface StrokeSectionProps {
  strokes: Stroke[];
  onStrokesChange: (strokes: Stroke[]) => void;
  disabled?: boolean;
}

// Icons
const StrokeIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2" />
  </svg>
);

const SolidLineIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="4" y1="12" x2="20" y2="12" />
  </svg>
);

const DashedLineIcon = (): React.JSX.Element => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeDasharray="4 2"
  >
    <line x1="4" y1="12" x2="20" y2="12" />
  </svg>
);

const DottedLineIcon = (): React.JSX.Element => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeDasharray="2 2"
    strokeLinecap="round"
  >
    <line x1="4" y1="12" x2="20" y2="12" />
  </svg>
);

const InsideIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
    <rect x="4" y="4" width="16" height="16" rx="2" strokeWidth="2" />
    <rect x="6" y="6" width="12" height="12" rx="1" fill="currentColor" opacity="0.2" />
  </svg>
);

const CenterIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
    <rect x="5" y="5" width="14" height="14" rx="2" strokeWidth="2" />
    <rect x="7" y="7" width="10" height="10" rx="1" fill="currentColor" opacity="0.2" />
  </svg>
);

const OutsideIcon = (): React.JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
    <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="2" />
    <rect x="6" y="6" width="12" height="12" rx="1" fill="currentColor" opacity="0.2" />
  </svg>
);

const styles = {
  content: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.md,
  },
  strokeItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: 'var(--muted)',
    borderRadius: radii.md,
    border: '1px solid var(--border)',
  },
  strokeHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
  },
  strokeControls: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    marginLeft: 'auto',
  },
  widthInput: {
    width: 50,
  },
  opacityInput: {
    width: 60,
  },
  optionsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.lg,
  },
  optionGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
  },
  optionLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: 'var(--muted-foreground)',
    minWidth: 50,
  },
  emptyState: {
    padding: spacing.lg,
    textAlign: 'center' as const,
    fontSize: fontSize.sm,
    color: 'var(--muted-foreground)',
  },
};

const defaultStroke: Stroke = {
  color: '#000000',
  width: 1,
  opacity: 1,
  style: 'solid',
  position: 'center',
};

export function StrokeSection({
  strokes,
  onStrokesChange,
  disabled = false,
}: StrokeSectionProps): React.JSX.Element {
  const [hiddenStrokes, setHiddenStrokes] = useState<Set<number>>(new Set());

  // Add new stroke
  const handleAddStroke = useCallback(() => {
    onStrokesChange([...strokes, { ...defaultStroke }]);
  }, [strokes, onStrokesChange]);

  // Remove stroke
  const handleRemoveStroke = useCallback(
    (index: number) => {
      onStrokesChange(strokes.filter((_, i) => i !== index));
      setHiddenStrokes((prev) => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    },
    [strokes, onStrokesChange]
  );

  // Toggle stroke visibility (local state for preview)
  const handleToggleVisibility = useCallback((index: number) => {
    setHiddenStrokes((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  // Update stroke
  const updateStroke = useCallback(
    (index: number, updates: Partial<Stroke>) => {
      const newStrokes = strokes.map((s, i) => (i === index ? { ...s, ...updates } : s));
      onStrokesChange(newStrokes);
    },
    [strokes, onStrokesChange]
  );

  // Preview for collapsed state
  const previewContent =
    strokes.length > 0 ? (
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        {strokes.slice(0, 3).map((stroke, i) => (
          <div
            key={i}
            style={{
              width: 14,
              height: 14,
              borderRadius: radii.sm,
              border: `2px ${stroke.style ?? 'solid'} ${stroke.color}`,
              backgroundColor: 'transparent',
            }}
          />
        ))}
        {strokes.length > 3 ? (
          <span style={{ fontSize: fontSize.xs, color: 'var(--muted-foreground)' }}>
            +{strokes.length - 3}
          </span>
        ) : null}
      </div>
    ) : undefined;

  return (
    <CollapsibleSection
      title="Stroke"
      sectionId="stroke"
      icon={<StrokeIcon />}
      defaultOpen={false}
      showAddButton
      onAdd={handleAddStroke}
      preview={previewContent}
    >
      <div style={styles.content}>
        {strokes.length === 0 ? (
          <div style={styles.emptyState}>No strokes. Click + to add one.</div>
        ) : (
          strokes.map((stroke, index) => (
            <div key={index} style={styles.strokeItem}>
              {/* Stroke header with color and width */}
              <div style={styles.strokeHeader}>
                <ColorInput
                  color={stroke.color}
                  onColorChange={(color: string) => {
                    updateStroke(index, { color });
                  }}
                  disabled={disabled}
                  compact
                />
                <div style={styles.widthInput}>
                  <NumberInput
                    value={stroke.width}
                    onChange={(width) => {
                      updateStroke(index, { width });
                    }}
                    min={0}
                    max={100}
                    disabled={disabled}
                  />
                </div>
                <div style={styles.strokeControls}>
                  <div style={styles.opacityInput}>
                    <NumberInput
                      value={Math.round((stroke.opacity ?? 1) * 100)}
                      onChange={(val) => {
                        updateStroke(index, { opacity: val / 100 });
                      }}
                      min={0}
                      max={100}
                      unit="%"
                      disabled={disabled}
                    />
                  </div>
                  <VisibilityToggle
                    visible={!hiddenStrokes.has(index)}
                    onChange={() => {
                      handleToggleVisibility(index);
                    }}
                    disabled={disabled}
                  />
                  <AddRemoveControls
                    onRemove={() => {
                      handleRemoveStroke(index);
                    }}
                    canRemove={!disabled}
                  />
                </div>
              </div>

              {/* Style and position options */}
              <div style={styles.optionsRow}>
                {/* Style selector */}
                <div style={styles.optionGroup}>
                  <span style={styles.optionLabel}>Style</span>
                  <IconButtonGroup>
                    <IconButton
                      icon={<SolidLineIcon />}
                      onClick={() => {
                        updateStroke(index, { style: 'solid' });
                      }}
                      isActive={stroke.style === 'solid' || stroke.style === undefined}
                      disabled={disabled}
                      title="Solid"
                      size="sm"
                    />
                    <IconButton
                      icon={<DashedLineIcon />}
                      onClick={() => {
                        updateStroke(index, { style: 'dashed' });
                      }}
                      isActive={stroke.style === 'dashed'}
                      disabled={disabled}
                      title="Dashed"
                      size="sm"
                    />
                    <IconButton
                      icon={<DottedLineIcon />}
                      onClick={() => {
                        updateStroke(index, { style: 'dotted' });
                      }}
                      isActive={stroke.style === 'dotted'}
                      disabled={disabled}
                      title="Dotted"
                      size="sm"
                    />
                  </IconButtonGroup>
                </div>

                {/* Position selector */}
                <div style={styles.optionGroup}>
                  <span style={styles.optionLabel}>Position</span>
                  <IconButtonGroup>
                    <IconButton
                      icon={<InsideIcon />}
                      onClick={() => {
                        updateStroke(index, { position: 'inside' });
                      }}
                      isActive={stroke.position === 'inside'}
                      disabled={disabled}
                      title="Inside"
                      size="sm"
                    />
                    <IconButton
                      icon={<CenterIcon />}
                      onClick={() => {
                        updateStroke(index, { position: 'center' });
                      }}
                      isActive={stroke.position === 'center' || stroke.position === undefined}
                      disabled={disabled}
                      title="Center"
                      size="sm"
                    />
                    <IconButton
                      icon={<OutsideIcon />}
                      onClick={() => {
                        updateStroke(index, { position: 'outside' });
                      }}
                      isActive={stroke.position === 'outside'}
                      disabled={disabled}
                      title="Outside"
                      size="sm"
                    />
                  </IconButtonGroup>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </CollapsibleSection>
  );
}

export default StrokeSection;
